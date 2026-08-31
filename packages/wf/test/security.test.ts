import { describe, expect, it } from "vitest";
import {
  EventPublishingWorkflowHistoryStore,
  InMemoryEventBus,
  InMemoryTokenRevocationStore,
  InMemoryWorkflowHistoryEventBus,
  InMemoryWorkflowHistoryStore,
  SecureWorkflowHistoryStreamGateway,
  SecureWorkflowStreamGateway,
  WorkflowAccessTokenError,
  WorkflowAccessTokenSigner,
  WorkflowHttpAdapter,
} from "../src";

describe("secure workflow access", () => {
  it("issues, verifies, authorizes, and revokes scoped tenant tokens", async () => {
    const revocations = new InMemoryTokenRevocationStore();
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
      { issuer: "wf" },
      revocations,
    );
    const token = await signer.issue({
      subject: "operator-1",
      scopes: ["workflow:read", "workflow:stream"],
      workflowIds: ["workflow-1"],
      tenantId: "tenant-1",
    });
    const claims = await signer.verify(token);
    signer.authorize(claims, "workflow-1", "workflow:stream", "tenant-1");
    expect(() =>
      signer.authorize(claims, "workflow-2", "workflow:stream", "tenant-1"),
    ).toThrow(WorkflowAccessTokenError);
    await signer.revoke(claims);
    await expect(signer.verify(token)).rejects.toThrow("revoked");
  });

  it("streams only events authorized by the signed token", async () => {
    const bus = new InMemoryEventBus<unknown>();
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const token = await signer.issue({
      subject: "ui",
      scopes: ["workflow:stream"],
      workflowIds: ["workflow-1"],
    });
    const gateway = new SecureWorkflowStreamGateway(bus, signer);
    const stream = gateway.stream("workflow-1", token);
    const iterator = stream[Symbol.asyncIterator]();
    const nextEvent = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await bus.publish({
      id: "event-1",
      workflowId: "workflow-1",
      eventType: "workflow.started",
      timestamp: Date.now(),
      payload: { type: "started", workflowId: "workflow-1", version: 1 },
    });
    await expect(nextEvent).resolves.toMatchObject({
      value: { workflowId: "workflow-1", eventType: "workflow.started" },
      done: false,
    });
    await iterator.return?.();
  });

  it("does not subscribe an event bus until authorization succeeds", async () => {
    let subscriptions = 0;
    const bus: import("../src").WorkflowEventBus = {
      publish: async () => undefined,
      subscribe: () => {
        subscriptions += 1;
        return () => undefined;
      },
      subscribeAll: () => () => undefined,
    };
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const gateway = new SecureWorkflowStreamGateway(bus, signer);
    const stream = gateway.stream(
      "workflow-1",
      "not-a-valid-token",
    );

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow(
      "Malformed access token",
    );
    expect(subscriptions).toBe(0);
  });

  it("rejects caller-supplied tenant ids that disagree with the authoritative resolver", async () => {
    const bus = new InMemoryEventBus<unknown>();
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const token = await signer.issue({
      subject: "ui",
      scopes: ["workflow:stream"],
      workflowIds: ["workflow-1"],
      tenantId: "tenant-1",
    });
    const gateway = new SecureWorkflowStreamGateway(
      bus,
      signer,
      () => "tenant-1",
    );

    await expect(
      gateway.subscribe("workflow-1", token, () => undefined, {
        tenantId: "tenant-2",
      }),
    ).rejects.toThrow("Requested tenant does not match");
  });

  it("fails closed when an authoritative tenant resolver cannot resolve a workflow", async () => {
    const bus = new InMemoryEventBus<unknown>();
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const token = await signer.issue({
      subject: "ui",
      scopes: ["workflow:stream"],
      workflowIds: ["workflow-1"],
      tenantId: "tenant-1",
    });
    const gateway = new SecureWorkflowStreamGateway(bus, signer, () => undefined);

    await expect(
      gateway.subscribe("workflow-1", token, () => undefined, {
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("Workflow tenant could not be resolved");
  });

  it("validates token options and claims before signing", async () => {
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const baseClaims = {
      subject: "operator-1",
      scopes: ["workflow:read"] as const,
      workflowIds: ["workflow-1"] as const,
    };

    await expect(
      signer.issue(baseClaims, { expiresInMs: 0 }),
    ).rejects.toThrow("expiresInMs must be positive");
    await expect(
      signer.issue({
        ...baseClaims,
        scopes: ["workflow:admin"] as unknown as readonly "workflow:read"[],
      }),
    ).rejects.toThrow("Token scopes are invalid");
  });

  it("times out query requests and propagates an abort signal", async () => {
    const adapter = new WorkflowHttpAdapter({
      baseUrl: "https://workflow.example.test",
      requestTimeoutMs: 5,
      fetch: async (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    });

    await expect(adapter.queryWorkflow("workflow-1", "token")).rejects.toThrow(
      "timed out after 5ms",
    );
  });

  it("streams authoritative replay history through the same scoped token boundary", async () => {
    const historyBus = new InMemoryWorkflowHistoryEventBus();
    const history = new EventPublishingWorkflowHistoryStore(
      new InMemoryWorkflowHistoryStore(),
      historyBus,
    );
    const signer = new WorkflowAccessTokenSigner(
      "a-secret-that-is-longer-than-32-characters",
    );
    const token = await signer.issue({
      subject: "ui",
      scopes: ["workflow:stream"],
      workflowIds: ["workflow-history"],
    });
    const gateway = new SecureWorkflowHistoryStreamGateway(historyBus, signer);
    const iterator = gateway
      .stream("workflow-history", token, { runId: "run-1" })
      [Symbol.asyncIterator]();
    const nextEvent = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await history.append(
      {
        workflowId: "workflow-history",
        runId: "run-1",
        eventType: "workflow.started",
        payload: { input: null },
      },
      0,
    );
    await expect(nextEvent).resolves.toMatchObject({
      done: false,
      value: {
        workflowId: "workflow-history",
        runId: "run-1",
        eventType: "workflow.started",
      },
    });
    await iterator.return?.();
  });
});
