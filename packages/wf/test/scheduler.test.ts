import { describe, expect, it } from "vitest";
import {
  InMemoryScheduleStore,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  ScheduleWorker,
  createReplayScheduleDispatcher,
  nextCronOccurrence,
} from "../src";

describe("durable scheduler", () => {
  it("calculates standard UTC cron occurrences", () => {
    const after = Date.parse("2025-01-01T00:00:00.000Z");
    expect(new Date(nextCronOccurrence("*/5 * * * *", after)).toISOString())
      .toBe("2025-01-01T00:05:00.000Z");
    expect(new Date(nextCronOccurrence("0 30 9 * * 1-5", after)).toISOString())
      .toBe("2025-01-01T09:30:00.000Z");
  });

  it("uses exclusive leases and acknowledges a dispatched schedule", async () => {
    const store = new InMemoryScheduleStore();
    const schedule = await store.upsert({
      scheduleId: "daily",
      cron: "* * * * *",
      workflowName: "daily-workflow",
      input: { tenant: "a" },
    }, 0);
    const first = await store.listDue(schedule.nextRunAt, "scheduler-a", 10, 1000);
    const second = await store.listDue(schedule.nextRunAt, "scheduler-b", 10, 1000);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(await store.acknowledge(first[0]!, schedule.nextRunAt + 60_000)).toBe(true);
  });

  it("dispatches due work and advances the schedule", async () => {
    const store = new InMemoryScheduleStore();
    const schedule = await store.upsert({
      scheduleId: "minute",
      cron: "* * * * *",
      workflowName: "minute-workflow",
      input: 1,
    }, Date.now() - 61_000);
    const dispatched: number[] = [];
    const abort = new AbortController();
    const worker = new ScheduleWorker(store, {
      workerId: "scheduler-a",
      pollIntervalMs: 1,
      concurrency: 1,
      signal: abort.signal,
      onDispatch: async ({ scheduledFor }) => {
        dispatched.push(scheduledFor);
        abort.abort();
      },
    });
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dispatched).toHaveLength(1);
    expect((await store.get("minute"))?.lastRunAt).toBe(schedule.nextRunAt);
  });

  it("maps each schedule occurrence to a deterministic replay run", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const runner = new ReplayWorkflowRunner(history, new InMemoryTaskQueue());
    const dispatcher = createReplayScheduleDispatcher({
      runner,
      resolve: (name) => name === "scheduled-workflow"
        ? {
            name,
            version: 1,
            activityRegistry: { get: () => undefined, register: () => undefined, list: () => [] },
            run: async () => "ok",
          }
        : undefined,
    });
    await dispatcher({
      scheduledFor: 123,
      schedule: {
        scheduleId: "schedule-1",
        cron: "* * * * *",
        workflowName: "scheduled-workflow",
        input: { ok: true },
        nextRunAt: 123,
        version: 1,
      },
    });
    const events = await history.read({
      workflowId: "schedule-1:123",
      runId: "scheduled",
    });
    expect(events.at(-1)?.eventType).toBe("workflow.completed");
  });
});
