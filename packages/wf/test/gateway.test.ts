import { describe, expect, it } from "vitest";
import {
  InMemoryActivityRegistry,
  InMemoryIdempotencyStore,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  WorkflowEventGateway,
  WorkflowQueryService,
} from "../src";

function createGateway() {
  const history = new InMemoryWorkflowHistoryStore();
  const runner = new ReplayWorkflowRunner(history, new InMemoryTaskQueue());
  return { history, runner };
}

describe("workflow event gateway", () => {
  it("coalesces duplicate events through an atomic idempotency store", async () => {
    const { runner } = createGateway();
    const gateway = new WorkflowEventGateway(runner, {
      idempotency: new InMemoryIdempotencyStore(),
    });
    gateway.register({
      id: "welcome",
      eventName: "user.created",
      workflow: {
        name: "welcome",
        version: 1,
        activityRegistry: new InMemoryActivityRegistry(),
        run: async (_context, event: { email: string }) => event.email,
      },
      input: (event: { payload: { email: string } }) => event.payload,
    });

    const event = {
      eventId: "event-1",
      eventName: "user.created",
      payload: { email: "user@example.com" },
      timestamp: Date.now(),
    };
    const [first, second] = await Promise.all([
      gateway.dispatch(event),
      gateway.dispatch(event),
    ]);

    expect(first[0]?.reference).toEqual(second[0]?.reference);
    await expect(first[0]!.result).resolves.toMatchObject({
      status: "completed",
      output: "user@example.com",
    });
    await expect(second[0]!.result).resolves.toMatchObject({
      status: "completed",
      output: "user@example.com",
    });
  });

  it("verifies signed webhooks before dispatching them", async () => {
    const { runner } = createGateway();
    const gateway = new WorkflowEventGateway(runner);
    gateway.register({
      id: "webhook-trigger",
      eventName: "provider.updated",
      workflow: {
        name: "provider-update",
        version: 1,
        activityRegistry: new InMemoryActivityRegistry(),
        run: async (_context, payload: { id: string }) => payload.id,
      },
      input: (event: { payload: { id: string } }) => event.payload,
    });

    const body = JSON.stringify({ id: "provider-1" });
    const timestamp = String(Date.now());
    const signature = await sign("secret", `${timestamp}.${body}`);
    const result = await gateway.handleWebhook(
      "provider.updated",
      {
        body,
        headers: {
          "x-wf-timestamp": timestamp,
          "x-wf-signature": `sha256=${signature}`,
          "x-event-id": "webhook-1",
        },
      },
      { secret: "secret" },
    );

    await expect(result[0]!.result).resolves.toMatchObject({
      status: "completed",
      output: "provider-1",
    });
    await expect(
      gateway.handleWebhook(
        "provider.updated",
        {
          body,
          headers: {
            "x-wf-timestamp": timestamp,
            "x-wf-signature": "sha256=invalid",
          },
        },
        { secret: "secret" },
      ),
    ).rejects.toThrow("invalid");
  });

  it("rejects oversized webhook bodies before parsing or dispatching", async () => {
    const { runner } = createGateway();
    const gateway = new WorkflowEventGateway(runner);

    await expect(
      gateway.handleWebhook(
        "provider.updated",
        {
          body: "0123456789",
          headers: {
            "x-wf-timestamp": String(Date.now()),
            "x-wf-signature": "ignored",
          },
        },
        { secret: "secret", maxBodyBytes: 5 },
      ),
    ).rejects.toThrow("exceeds the configured size limit");
  });

  it("rejects idempotency-key reuse with a conflicting payload", async () => {
    const { runner } = createGateway();
    const gateway = new WorkflowEventGateway(runner);
    gateway.register({
      id: "conflicting-trigger",
      eventName: "conflicting.event",
      idempotencyKey: () => "same-key",
      workflow: {
        name: "conflicting",
        version: 1,
        activityRegistry: new InMemoryActivityRegistry(),
        run: async (
          _context: import("../src").ReplayWorkflowContext,
          input: { value: number },
        ) => input.value,
      },
      input: (event: { payload: { value: number } }) => event.payload,
    });
    await gateway.dispatch({
      eventId: "event-a",
      eventName: "conflicting.event",
      payload: { value: 1 },
      timestamp: Date.now(),
    });
    await expect(
      gateway.dispatch({
        eventId: "event-b",
        eventName: "conflicting.event",
        payload: { value: 2 },
        timestamp: Date.now(),
      }),
    ).rejects.toThrow("different payload");
  });

  it("waits for a duplicate owned by another gateway instance", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const runner = new ReplayWorkflowRunner(history, queue);
    const idempotency = new InMemoryIdempotencyStore();
    const workflow = {
      name: "distributed-trigger",
      version: 1,
      activityRegistry: new InMemoryActivityRegistry(),
      run: async (
        _context: import("../src").ReplayWorkflowContext,
        value: string,
      ) => value,
    };
    const firstGateway = new WorkflowEventGateway(runner, { idempotency });
    const secondGateway = new WorkflowEventGateway(runner, {
      idempotency,
      duplicateWaitTimeoutMs: 1000,
      duplicatePollIntervalMs: 1,
    });
    for (const gateway of [firstGateway, secondGateway]) {
      gateway.register({
        id: "distributed",
        eventName: "distributed.event",
        workflow,
        input: (event: { payload: string }) => event.payload,
      });
    }
    const event = {
      eventId: "distributed-1",
      eventName: "distributed.event",
      payload: "ok",
      timestamp: Date.now(),
    };
    const [first, second] = await Promise.all([
      firstGateway.dispatch(event),
      secondGateway.dispatch(event),
    ]);
    await expect(first[0]!.result).resolves.toMatchObject({
      status: "completed",
      output: "ok",
    });
    await expect(second[0]!.result).resolves.toMatchObject({
      status: "completed",
      output: "ok",
    });
  });
});

describe("workflow query service", () => {
  it("reports an active run as running", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    await history.append(
      {
        workflowId: "running-workflow",
        runId: "run-1",
        eventType: "workflow.started",
        payload: { input: null },
      },
      0,
    );
    const query = new WorkflowQueryService(history);
    await expect(query.get("running-workflow", "run-1")).resolves.toMatchObject(
      {
        status: "running",
      },
    );
  });

  it("projects waiting and completed state from authoritative history", async () => {
    const { history, runner } = createGateway();
    const registry = new InMemoryActivityRegistry();
    const definition = {
      name: "approval",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.waitForEvent<{ approved: boolean }>(
          "approval",
          "approval.received",
        ),
    };
    const waiting = await runner.start(definition, undefined, {
      tenantId: "tenant-1",
    });
    const queries = new WorkflowQueryService(history);
    await expect(
      queries.get(waiting.workflowId, waiting.runId),
    ).resolves.toMatchObject({
      status: "waiting",
      waitingForEvents: ["approval.received"],
      tenantId: "tenant-1",
    });

    const waitId = `${waiting.workflowId}:${waiting.runId}:event:approval:1`;
    await runner.signal(
      waiting.workflowId,
      waiting.runId,
      waitId,
      "approval.received",
      { approved: true },
      { tenantId: "tenant-1" },
    );
    await runner.run(definition, waiting.workflowId, waiting.runId, {
      tenantId: "tenant-1",
    });
    await expect(
      queries.get(waiting.workflowId, waiting.runId),
    ).resolves.toMatchObject({
      status: "completed",
      output: { approved: true },
    });
  });
});

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
