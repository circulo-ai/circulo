import { describe, expect, it } from "vitest";
import {
  InMemoryActivityRegistry,
  InMemoryTaskQueue,
  InMemoryWorkflowHistoryStore,
  ReplayWorkflowRunner,
  MapWorkflowLockStore,
  ActivityWorker,
  defineActivity,
  defineDurableWorkflow,
  formatDuration,
  parseDuration,
} from "../src";

describe("durable duration utilities", () => {
  it("parses numeric, singular, plural, and compound durations", () => {
    expect(parseDuration(30)).toBe(30);
    expect(parseDuration("0ms")).toBe(0);
    expect(parseDuration("500 milliseconds")).toBe(500);
    expect(parseDuration("2 sec")).toBe(2_000);
    expect(parseDuration("3 minutes")).toBe(180_000);
    expect(parseDuration("4 hours")).toBe(14_400_000);
    expect(parseDuration("30d")).toBe(30 * 86_400_000);
    expect(parseDuration("3 days")).toBe(3 * 86_400_000);
    expect(parseDuration("1h 20m")).toBe(4_800_000);
    expect(parseDuration("2 weeks 3 days 4s")).toBe(
      2 * 604_800_000 + 3 * 86_400_000 + 4_000,
    );
    expect(formatDuration(30 * 86_400_000)).toBe("4w 2d");
  });

  it("rejects ambiguous and unsafe durations", () => {
    for (const value of [
      "",
      "3 months",
      "-1s",
      "+1s",
      "1 dayoops",
      "1h20m",
      "1h 2h",
      "999999999999999999999d",
      Number.NaN,
      Infinity,
    ]) {
      expect(() => parseDuration(value as number | string)).toThrow(RangeError);
    }
  });
});

describe("durable workflow sleep", () => {
  it("replays from the beginning and continues after a 30-day sleep", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const activities = new InMemoryActivityRegistry();
    let beforeSleepCalls = 0;
    activities.register(
      defineActivity("before-sleep", async (value: string) => {
        beforeSleepCalls += 1;
        return value.toUpperCase();
      }),
    );
    const workflow = defineDurableWorkflow({
      name: "durable-sleep-demo",
      version: 1,
      activityRegistry: activities,
      run: async (wf, input: string) => {
        const value = await wf.activity("before-sleep", input);
        await wf.sleep("three-days", "30 days");
        return `${value}:continued`;
      },
    });
    const runner = new ReplayWorkflowRunner(history, queue);
    const started = await runner.start(workflow, "ready");

    const activityWorker = new ActivityWorker({
      id: "activity-worker",
      queue,
      registry: activities,
      history,
      pollIntervalMs: 1,
      onWorkflowReady: (workflowId, runId) =>
        runner.run(workflow, workflowId, runId).then(() => undefined),
    });
    await activityWorker.start();
    await waitUntil(async () =>
      (await history.read({ workflowId: started.workflowId, runId: started.runId }))
        .some((event) => event.eventType === "timer.started"),
    );
    await activityWorker.stop();

    expect(beforeSleepCalls).toBe(1);
    const timerStarted = (await history.read({
      workflowId: started.workflowId,
      runId: started.runId,
    })).find((event) => event.eventType === "timer.started")!;
    const timerPayload = timerStarted.payload as { timerId: string; fireAt: number };
    expect(timerPayload.fireAt - timerStarted.timestamp).toBeGreaterThanOrEqual(
      30 * 86_400_000 - 1,
    );

    const restartedRunner = new ReplayWorkflowRunner(history, queue);
    const claimed = await queue.claim({
      queue: "timer",
      workerId: "timer-worker",
      leaseDurationMs: 30_000,
      now: timerPayload.fireAt,
    });
    expect(claimed?.task.id).toBe(timerPayload.timerId);
    await history.append(
      {
        workflowId: started.workflowId,
        runId: started.runId,
        eventId: `${timerPayload.timerId}:fired`,
        eventType: "timer.fired",
        payload: timerPayload,
      },
      await history.nextSequence(started.workflowId, started.runId),
    );
    await queue.acknowledge(timerPayload.timerId, claimed!.lease.token);

    const completed = await restartedRunner.run(
      workflow,
      started.workflowId,
      started.runId,
    );
    expect(completed).toMatchObject({ status: "completed", output: "READY:continued" });
    expect(beforeSleepCalls).toBe(1);
  });

  it("coalesces duplicate timer delivery and supports absolute timestamps", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const runner = new ReplayWorkflowRunner(history, queue);
    const fireAt = Date.now() + 86_400_000;
    const workflow = defineDurableWorkflow({
      name: "absolute-sleep",
      version: 1,
      run: async (wf: import("../src").DurableWorkflowContext) => {
        await wf.sleepUntil("tomorrow", new Date(fireAt));
        return "continued";
      },
    });
    const started = await runner.start(workflow, undefined);
    const timer = (await history.read({ workflowId: started.workflowId, runId: started.runId }))
      .find((event) => event.eventType === "timer.started")!;
    const payload = timer.payload as { timerId: string; fireAt: number };
    expect(payload.fireAt).toBe(fireAt);

    await history.append(
      {
        workflowId: started.workflowId,
        runId: started.runId,
        eventId: `${payload.timerId}:fired`,
        eventType: "timer.fired",
        payload,
      },
      await history.nextSequence(started.workflowId, started.runId),
    );
    await history.append(
      {
        workflowId: started.workflowId,
        runId: started.runId,
        eventId: `${payload.timerId}:fired`,
        eventType: "timer.fired",
        payload,
      },
      await history.nextSequence(started.workflowId, started.runId),
    );
    await expect(runner.run(workflow, started.workflowId, started.runId)).resolves.toMatchObject({
      status: "completed",
      output: "continued",
    });
  });

  it("repairs the history-written but task-not-enqueued crash window", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const originalEnqueue = queue.enqueue.bind(queue);
    let failOnce = true;
    queue.enqueue = async (task) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("queue unavailable");
      }
      return originalEnqueue(task);
    };
    const workflow = defineDurableWorkflow({
      name: "repairable-sleep",
      version: 1,
      run: async (wf) => {
        await wf.sleep("cooldown", "30 days");
        return "done";
      },
    });
    const runner = new ReplayWorkflowRunner(history, queue);
    await expect(
      runner.start(workflow, undefined, { workflowId: "w", runId: "r" }),
    ).rejects.toThrow("queue unavailable");
    const retry = await runner.start(workflow, undefined, {
      workflowId: "w",
      runId: "r",
    });
    expect(retry.status).toBe("waiting");
    expect(
      await queue.claim({
        queue: "timer",
        workerId: "repair-check",
        leaseDurationMs: 1_000,
        now: Date.now() + 30 * 86_400_000,
      }),
    ).not.toBeNull();
  });

  it("coalesces duplicate resumes with a durable run lock", async () => {
    const history = new InMemoryWorkflowHistoryStore();
    const queue = new InMemoryTaskQueue();
    const resumeLock = new MapWorkflowLockStore();
    let continuationCalls = 0;
    let releaseContinuation!: () => void;
    const continuationReleased = new Promise<void>((resolve) => {
      releaseContinuation = resolve;
    });
    const runner = new ReplayWorkflowRunner(history, queue, { resumeLock });
    const workflow = defineDurableWorkflow({
      name: "coalesced-resume",
      version: 1,
      run: async (wf) => {
        await wf.sleep("pause", 0);
        continuationCalls += 1;
        await continuationReleased;
        return "done";
      },
    });
    const started = await runner.start(workflow, undefined);
    const timer = (await history.read({ workflowId: started.workflowId, runId: started.runId }))
      .find((event) => event.eventType === "timer.started")!;
    const payload = timer.payload as { timerId: string; fireAt: number };
    await history.append(
      {
        workflowId: started.workflowId,
        runId: started.runId,
        eventId: `${payload.timerId}:fired`,
        eventType: "timer.fired",
        payload,
      },
      await history.nextSequence(started.workflowId, started.runId),
    );

    const first = runner.run(workflow, started.workflowId, started.runId);
    await waitUntil(() => continuationCalls === 1);
    const duplicate = await runner.run(workflow, started.workflowId, started.runId);
    expect(duplicate.status).toBe("waiting");
    releaseContinuation();
    await expect(first).resolves.toMatchObject({ status: "completed", output: "done" });
    expect(continuationCalls).toBe(1);
  });
});

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await predicate()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(await predicate()).toBe(true);
}
