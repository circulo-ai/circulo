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
