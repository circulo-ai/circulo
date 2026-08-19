import { describe, expect, it } from "vitest";
import {
  ActivityWorker,
  defineActivity,
  InMemoryActivityRegistry,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  TimerWorker,
  WorkflowReplayCursor,
  WorkflowReplayError,
} from "../src";
import type { WorkflowHistoryEvent } from "../src";

function event(
  sequence: number,
  eventType: WorkflowHistoryEvent["eventType"],
  payload: unknown = {},
): WorkflowHistoryEvent {
  return {
    eventId: `event-${sequence}`,
    workflowId: "workflow-1",
    runId: "run-1",
    sequence,
    eventType,
    timestamp: sequence,
    payload,
  };
}

describe("workflow replay cursor", () => {
  it("consumes recorded events in order and validates completion", () => {
    const cursor = new WorkflowReplayCursor([
      event(0, "workflow.started"),
      event(1, "activity.completed", { value: 42 }),
      event(2, "workflow.completed"),
    ]);

    expect(cursor.peek()?.eventType).toBe("workflow.started");
    cursor.take("workflow.started");
    const activity = cursor.take<{ value: number }>(
      "activity.completed",
      (item) => item.payload.value === 42,
    );
    expect(activity.payload.value).toBe(42);
    cursor.take("workflow.completed");
    expect(cursor.done).toBe(true);
    expect(() => cursor.assertDone()).not.toThrow();
  });

  it("detects divergence, leftovers, and sequence gaps", () => {
    const cursor = new WorkflowReplayCursor([event(0, "workflow.started")]);
    expect(() => cursor.take("activity.scheduled")).toThrow(
      WorkflowReplayError,
    );
    expect(() => cursor.assertDone()).toThrow("unconsumed");

    expect(
      () =>
        new WorkflowReplayCursor([
          event(0, "workflow.started"),
          event(2, "workflow.completed"),
        ]),
    ).toThrow("sequence gap");
  });

  it("supports optional signal consumption without advancing incorrectly", () => {
    const cursor = new WorkflowReplayCursor([
      event(0, "workflow.started"),
      event(1, "signal.received", { type: "approval" }),
    ]);
    cursor.take("workflow.started");
    expect(
      cursor.takeIf<{ type: string }>(
        "signal.received",
        (item) => item.payload.type === "other",
      ),
    ).toBeUndefined();
    expect(cursor.remaining).toBe(1);
    expect(cursor.takeIf<{ type: string }>("signal.received")?.payload).toEqual({
      type: "approval",
    });
    expect(cursor.done).toBe(true);
  });
});

describe("replay-safe workflow execution", () => {
  it("suspends for an activity, records its result, and resumes by replaying history", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    registry.register(
      defineActivity<number, number>("double", async (input) => input * 2),
    );
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "replay-demo",
      version: 1,
      activityRegistry: registry,
      run: async (context: { activity: <TInput, TOutput>(name: string, input: TInput) => Promise<TOutput> }, input: number) =>
        context.activity<number, number>("double", input),
    };
    let finalResult: unknown;
    const activityWorker = new ActivityWorker({
      id: "activity-worker",
      queue,
      registry,
      history,
      pollIntervalMs: 1,
      onWorkflowReady: async (workflowId, runId) => {
        finalResult = await runner.run(definition, workflowId, runId);
      },
    });

    const waiting = await runner.start(definition, 21);
    expect(waiting.status).toBe("waiting");
    await activityWorker.start();
    await waitUntil(() => (finalResult as { status?: string } | undefined)?.status === "completed");
    await activityWorker.stop();

    expect(finalResult).toMatchObject({ status: "completed", output: 42 });
    const events = await history.read({
      workflowId: waiting.workflowId,
      runId: waiting.runId,
    });
    expect(events.map((item) => item.eventType)).toEqual([
      "workflow.started",
      "activity.scheduled",
      "activity.started",
      "activity.completed",
      "workflow.completed",
    ]);
  });

  it("replays parallel activity completions independently of finish order", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    registry.register(
      defineActivity<number, number>("double", async (input) => {
        await new Promise((resolve) => setTimeout(resolve, input === 1 ? 15 : 1));
        return input * 2;
      }),
    );
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "parallel-demo",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) => {
        const values = await context.parallel([
          () => context.activity<number, number>("double", 1),
          () => context.activity<number, number>("double", 2),
        ]);
        return values.reduce((total, value) => total + value, 0);
      },
    };
    const waiting = await runner.start(definition, undefined);
    const activityWorker = new ActivityWorker({
      id: "parallel-activity-worker",
      queue,
      registry,
      history,
      concurrency: 2,
      pollIntervalMs: 1,
      onWorkflowReady: async (workflowId, runId) => {
        await runner.run(definition, workflowId, runId);
      },
    });
    await activityWorker.start();
    await waitUntil(async () => {
      const events = await history.read({
        workflowId: waiting.workflowId,
        runId: waiting.runId,
      });
      return events.at(-1)?.eventType === "workflow.completed";
    });
    await activityWorker.stop();

    await expect(
      runner.run(definition, waiting.workflowId, waiting.runId),
    ).resolves.toMatchObject({ status: "completed", output: 6 });
  });

  it("suspends on a durable timer and resumes through a timer worker", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "timer-demo",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) => {
        await context.sleep("cooldown", 5);
        return "ready";
      },
    };
    const waiting = await runner.start(definition, undefined);
    expect(waiting.status).toBe("waiting");
    const timerWorker = new TimerWorker({
      id: "timer-worker",
      queue,
      history,
      pollIntervalMs: 1,
      onWorkflowReady: async (workflowId, runId) => {
        await runner.run(definition, workflowId, runId);
      },
    });
    await timerWorker.start();
    await waitUntil(async () => {
      const events = await history.read({
        workflowId: waiting.workflowId,
        runId: waiting.runId,
      });
      return events.at(-1)?.eventType === "workflow.completed";
    });
    await timerWorker.stop();

    await expect(
      runner.run(definition, waiting.workflowId, waiting.runId),
    ).resolves.toMatchObject({ status: "completed", output: "ready" });
  });

  it("retries a failed activity at least once and replays all attempt history", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    let attempts = 0;
    registry.register(
      defineActivity<void, string>(
        "flaky",
        async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary outage");
          return "ok";
        },
        { retryPolicy: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0 } },
      ),
    );
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "retry-activity",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.activity("flaky", undefined),
    };
    const started = await runner.start(definition, undefined);
    const worker = new ActivityWorker({
      id: "retry-worker",
      queue,
      registry,
      history,
      pollIntervalMs: 1,
      onWorkflowReady: async (workflowId, runId) => {
        await runner.run(definition, workflowId, runId);
      },
    });
    await worker.start();
    await waitUntil(async () =>
      (await history.read({ workflowId: started.workflowId, runId: started.runId })).at(-1)?.eventType ===
        "workflow.completed",
    );
    await worker.stop();
    expect(attempts).toBe(2);
    expect((await history.read({ workflowId: started.workflowId, runId: started.runId }))
      .filter((item) => item.eventType === "activity.failed")).toHaveLength(1);
  });

  it("waits for an external event and resumes with its typed payload", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "approval-demo",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.waitForEvent<{ approved: boolean }>("approval", "approval.received"),
    };
    const waiting = await runner.start(definition, undefined);
    expect(waiting.status).toBe("waiting");
    const waitId = `${waiting.workflowId}:${waiting.runId}:event:approval:1`;
    await runner.signal(
      waiting.workflowId,
      waiting.runId,
      waitId,
      "approval.received",
      { approved: true },
    );

    await expect(
      runner.run(definition, waiting.workflowId, waiting.runId),
    ).resolves.toMatchObject({
      status: "completed",
      output: { approved: true },
    });
  });

  it("runs durable Saga compensation in reverse order after a failure", async () => {
    const queue = new InMemoryTaskQueue();
    const history = new InMemoryWorkflowHistoryStore();
    const registry = new InMemoryActivityRegistry();
    const compensated: string[] = [];
    registry.register(
      defineActivity<void, string>("reserve", async () => "reservation-1"),
    );
    registry.register(
      defineActivity<string, void>("release", async (input) => {
        compensated.push(input);
      }),
    );
    registry.register(
      defineActivity<void, void>(
        "charge",
        async () => {
          throw new Error("card declined");
        },
        { retryPolicy: { maxAttempts: 1 } },
      ),
    );
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "saga-demo",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.saga(async (saga) => {
          await saga.activity("reserve", undefined, {
            compensate: {
              name: "release",
              input: (reservation) => reservation,
            },
          });
          await saga.activity("charge", undefined);
          return "paid";
        }),
    };
    const start = await runner.start(definition, undefined);
    const activityWorker = new ActivityWorker({
      id: "saga-activity-worker",
      queue,
      registry,
      history,
      pollIntervalMs: 1,
      onWorkflowReady: async (workflowId, runId) => {
        await runner.run(definition, workflowId, runId);
      },
    });
    await activityWorker.start();
    await waitUntil(async () => {
      const events = await history.read({
        workflowId: start.workflowId,
        runId: start.runId,
      });
      return events.at(-1)?.eventType === "workflow.failed";
    });
    await activityWorker.stop();

    expect(compensated).toEqual(["reservation-1"]);
    await expect(
      runner.run(definition, start.workflowId, start.runId),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("supports bounded batch processing with partial failures", async () => {
    const { runner } = (() => {
      const history = new InMemoryWorkflowHistoryStore();
      return {
        runner: new ReplayWorkflowRunner(history, new InMemoryTaskQueue()),
      };
    })();
    const definition = {
      name: "batch-demo",
      version: 1,
      activityRegistry: new InMemoryActivityRegistry(),
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.batch(
          "items",
          [1, 2, 3],
          async (item) => {
            if (item === 2) throw new Error("invalid item");
            return item * 10;
          },
          { concurrency: 2 },
        ),
    };
    const result = await runner.start(definition, undefined);
    expect(result.status).toBe("completed");
    expect(result.output?.results).toEqual([10, undefined, 30]);
    expect(result.output?.failures).toEqual([{ index: 1, message: "invalid item" }]);
    expect(result.output?.completed).toBe(2);
  });

  it("coalesces concurrent replay writers through deterministic history and task ids", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const registry = new InMemoryActivityRegistry();
    registry.register(defineActivity("identity", async (input: string) => input));
    const runner = new ReplayWorkflowRunner(history, queue);
    const definition = {
      name: "concurrent-replay",
      version: 1,
      activityRegistry: registry,
      run: async (context: import("../src").ReplayWorkflowContext) =>
        context.activity("identity", "ok"),
    };
    const results = await Promise.all([
      runner.start(definition, undefined, { workflowId: "shared", runId: "run" }),
      runner.start(definition, undefined, { workflowId: "shared", runId: "run" }),
    ]);
    expect(results.every((result) => result.status === "waiting")).toBe(true);
    expect(await queue.stats()).toMatchObject({ queued: 1 });
    expect((await history.read({ workflowId: "shared", runId: "run" })).filter(
      (item) => item.eventType === "activity.scheduled",
    )).toHaveLength(1);
  });
});

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!(await predicate()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(await predicate()).toBe(true);
}
