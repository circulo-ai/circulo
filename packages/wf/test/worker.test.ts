import { describe, expect, it } from "vitest";
import {
  InMemoryTaskQueue,
  RecoveryWorker,
  Worker,
  type TaskEnvelope,
} from "../src";

function task(
  id: string,
  options: Partial<TaskEnvelope<{ value: number }>> = {},
): TaskEnvelope<{ value: number }> {
  return {
    id,
    kind: "activity",
    queue: "activity",
    payload: { value: 1 },
    attempt: 0,
    maxAttempts: 3,
    priority: 0,
    createdAt: Date.now(),
    availableAt: Date.now(),
    ...options,
  };
}

describe("durable task queue", () => {
  it("allows only one worker to hold a lease", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("task-1"));

    const first = await queue.claim({
      queue: "activity",
      workerId: "worker-1",
      leaseDurationMs: 1000,
    });
    const second = await queue.claim({
      queue: "activity",
      workerId: "worker-2",
      leaseDurationMs: 1000,
    });

    expect(first?.lease.workerId).toBe("worker-1");
    expect(second).toBeNull();
    expect(await queue.acknowledge("task-1", "wrong-token")).toBe(false);
    expect(await queue.acknowledge("task-1", first!.lease.token)).toBe(true);
    expect((await queue.stats()).queued).toBe(0);
  });

  it("reclaims expired leases for another worker", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("task-2", { createdAt: 1, availableAt: 1 }));

    const first = await queue.claim({
      queue: "activity",
      workerId: "worker-1",
      leaseDurationMs: 10,
      now: 100,
    });
    expect(first).not.toBeNull();

    expect(await queue.reclaimExpiredLeases(111)).toBe(1);
    const recovered = await queue.claim({
      queue: "activity",
      workerId: "worker-2",
      leaseDurationMs: 1000,
      now: 111,
    });

    expect(recovered?.lease.workerId).toBe("worker-2");
    expect(recovered?.task.attempt).toBe(2);
  });
});

describe("Worker", () => {
  it("retries a failed task and acknowledges it after recovery", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("task-3", { maxAttempts: 2 }));
    let attempts = 0;

    const worker = new Worker({
      id: "activity-worker",
      role: "activity",
      queues: ["activity"],
      queue,
      pollIntervalMs: 1,
      handler: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            type: "retry" as const,
            availableAt: Date.now(),
            failure: {
              message: "temporary failure",
              retryable: true,
              timestamp: Date.now(),
            },
          };
        }
        return { type: "acknowledge" as const };
      },
    });

    await worker.start();
    await waitUntil(() => worker.status.completedTasks === 1);
    await worker.stop();

    expect(attempts).toBe(2);
    expect(worker.status.state).toBe("stopped");
    expect((await queue.stats()).queued).toBe(0);
  });

  it("only consumes tasks for its tenant", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("tenant-a", { tenantId: "tenant-a" }));
    await queue.enqueue(task("tenant-b", { tenantId: "tenant-b" }));

    const worker = new Worker({
      id: "tenant-a-worker",
      role: "activity",
      queues: ["activity"],
      tenantId: "tenant-a",
      queue,
      pollIntervalMs: 1,
      handler: async () => ({ type: "acknowledge" as const }),
    });

    await worker.start();
    await waitUntil(() => worker.status.completedTasks === 1);
    await worker.stop();

    expect((await queue.stats()).queued).toBe(1);
  });

  it("applies the worker attempt cap and reports queue failures", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("task-worker-cap", { maxAttempts: 3 }));
    const errors: string[] = [];
    const claim = queue.claim.bind(queue);
    let claimFailures = 1;
    queue.claim = async (options) => {
      if (claimFailures > 0) {
        claimFailures -= 1;
        throw new Error("queue temporarily unavailable");
      }
      return claim(options);
    };

    const worker = new Worker({
      id: "capped-worker",
      role: "activity",
      queues: ["activity"],
      queue,
      maxAttempts: 1,
      pollIntervalMs: 1,
      onError: (error) => {
        errors.push(error.message);
      },
      handler: async () => ({
        type: "retry" as const,
        failure: {
          message: "not retryable for this worker",
          retryable: true,
          timestamp: Date.now(),
        },
      }),
    });

    await worker.start();
    await waitUntil(() => worker.status.failedTasks === 1);
    await worker.stop();

    expect(errors).toEqual(["queue temporarily unavailable"]);
    expect((await queue.stats()).queued).toBe(0);
  });

  it("runs lease recovery as an independent lifecycle component", async () => {
    const queue = new InMemoryTaskQueue();
    await queue.enqueue(task("task-4", { createdAt: 1, availableAt: 1 }));
    const claimed = await queue.claim({
      queue: "activity",
      workerId: "crashed-worker",
      leaseDurationMs: 1,
      now: 10,
    });
    expect(claimed).not.toBeNull();

    const recovery = new RecoveryWorker({
      id: "recovery-1",
      queue,
      intervalMs: 5,
    });
    await recovery.start();
    await waitUntil(() => recovery.status.reclaimedTasks === 1);
    await recovery.stop();

    expect(recovery.status.running).toBe(false);
    expect((await queue.stats()).queued).toBe(1);
  });
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(predicate()).toBe(true);
}
