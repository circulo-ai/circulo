import { describe, expect, it } from "vitest";
import {
  JsonTaskQueue,
  JsonWorkflowHistoryStore,
  MapJsonKeyValueStore,
  MapWorkflowLockStore,
  type TaskEnvelope,
} from "../src";

describe("JSON durable replay adapters", () => {
  it("persists append-only history and rejects stale writers", async () => {
    const values = new MapJsonKeyValueStore();
    const locks = new MapWorkflowLockStore();
    const first = new JsonWorkflowHistoryStore(values, locks);
    const event = {
      workflowId: "workflow-1",
      runId: "run-1",
      eventId: "started",
      eventType: "workflow.started" as const,
      payload: { input: "hello" },
    };
    expect(await first.append(event, 0)).toMatchObject({ nextSequence: 1 });

    const restarted = new JsonWorkflowHistoryStore(values, locks);
    expect(await restarted.nextSequence("workflow-1", "run-1")).toBe(1);
    expect(await restarted.read({ workflowId: "workflow-1", runId: "run-1" })).toMatchObject([
      { eventId: "started", sequence: 0, payload: { input: "hello" } },
    ]);
    expect(await restarted.append({ ...event, eventId: "second", eventType: "workflow.completed", payload: {} }, 0)).toBeNull();
    await expect(
      restarted.append({ ...event, payload: { input: "different" } }, 1),
    ).rejects.toThrow("reused with different content");
  });

  it("persists delayed tasks, validates leases, and recovers expired work", async () => {
    const values = new MapJsonKeyValueStore();
    const locks = new MapWorkflowLockStore();
    const queue = new JsonTaskQueue(values, locks);
    const task: TaskEnvelope<{ timerId: string }> = {
      id: "timer-1",
      kind: "timer",
      queue: "timer",
      workflowId: "workflow-1",
      runId: "run-1",
      payload: { timerId: "timer-1" },
      attempt: 0,
      maxAttempts: 1,
      priority: 0,
      createdAt: 1,
      availableAt: 100,
    };
    await queue.enqueue(task);
    const restarted = new JsonTaskQueue(values, locks);
    expect(await restarted.claim({
      queue: "timer",
      workerId: "worker-1",
      leaseDurationMs: 10,
      now: 99,
    })).toBeNull();
    const claimed = await restarted.claim({
      queue: "timer",
      workerId: "worker-1",
      leaseDurationMs: 10,
      now: 100,
    });
    expect(claimed?.task.attempt).toBe(1);
    expect(await restarted.acknowledge(task.id, "wrong-token")).toBe(false);
    expect(await restarted.reclaimExpiredLeases(111)).toBe(1);
    const recovered = await restarted.claim({
      queue: "timer",
      workerId: "worker-2",
      leaseDurationMs: 10,
      now: 111,
    });
    expect(recovered?.lease.workerId).toBe("worker-2");
    expect(recovered?.task.attempt).toBe(2);
  });
});
