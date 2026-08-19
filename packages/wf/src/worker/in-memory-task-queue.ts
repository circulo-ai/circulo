import { generateId } from "../utils/id";
import type {
  ClaimedTask,
  TaskClaimOptions,
  TaskEnvelope,
  TaskFailure,
  TaskQueueAdapter,
  TaskQueueStats,
  TaskRescheduleOptions,
} from "../models";

/** Reference queue used by tests and local worker development. */
export class InMemoryTaskQueue implements TaskQueueAdapter {
  private readonly tasks = new Map<string, TaskEnvelope<unknown>>();

  async enqueue<TPayload>(task: TaskEnvelope<TPayload>): Promise<void> {
    const existing = this.tasks.get(task.id);
    if (existing) {
      if (
        existing.kind !== task.kind ||
        existing.queue !== task.queue ||
        JSON.stringify(existing.payload) !== JSON.stringify(task.payload)
      ) {
        throw new Error(`Task ${task.id} was reused with different content`);
      }
      return;
    }
    if (!Number.isInteger(task.attempt) || task.attempt < 0) {
      throw new RangeError("Task attempt must be a non-negative integer");
    }
    if (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1) {
      throw new RangeError("Task maxAttempts must be a positive integer");
    }
    this.tasks.set(task.id, structuredClone(task) as TaskEnvelope<unknown>);
  }

  async claim<TPayload>(
    options: TaskClaimOptions,
  ): Promise<ClaimedTask<TPayload> | null> {
    const now = options.now ?? Date.now();
    const candidates = [...this.tasks.values()]
      .filter((task) => {
        if (
          (options.queue !== "*" && task.queue !== options.queue) ||
          task.availableAt > now
        )
          return false;
        if (task.lease && task.lease.expiresAt > now) return false;
        return options.tenantId === undefined || task.tenantId === options.tenantId;
      })
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.createdAt - right.createdAt ||
          left.id.localeCompare(right.id),
      );
    const task = candidates[0];
    if (!task) return null;

    const lease: NonNullable<TaskEnvelope["lease"]> = {
      token: generateId("lease"),
      workerId: options.workerId,
      acquiredAt: now,
      expiresAt: now + options.leaseDurationMs,
    };
    task.attempt += 1;
    task.lease = lease;

    return {
      task: structuredClone(task) as TaskEnvelope<TPayload>,
      lease: structuredClone(lease),
    };
  }

  async heartbeat(
    taskId: string,
    leaseToken: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.lease?.token !== leaseToken) return false;
    task.lease.expiresAt = Date.now() + leaseDurationMs;
    return true;
  }

  async acknowledge(taskId: string, leaseToken: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.lease?.token !== leaseToken) return false;
    this.tasks.delete(taskId);
    return true;
  }

  async reschedule(
    taskId: string,
    leaseToken: string,
    options: TaskRescheduleOptions,
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.lease?.token !== leaseToken) return false;
    task.availableAt = options.availableAt;
    task.lease = undefined;
    return true;
  }

  async reject(
    taskId: string,
    leaseToken: string,
    _failure: TaskFailure,
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.lease?.token !== leaseToken) return false;
    this.tasks.delete(taskId);
    return true;
  }

  async reclaimExpiredLeases(now = Date.now()): Promise<number> {
    let reclaimed = 0;
    for (const task of this.tasks.values()) {
      if (task.lease && task.lease.expiresAt <= now) {
        task.lease = undefined;
        task.availableAt = Math.min(task.availableAt, now);
        reclaimed += 1;
      }
    }
    return reclaimed;
  }

  async stats(queue?: string): Promise<TaskQueueStats> {
    const tasks = [...this.tasks.values()].filter(
      (task) => queue === undefined || task.queue === queue,
    );
    const now = Date.now();
    return {
      queued: tasks.filter((task) => !task.lease && task.availableAt <= now).length,
      leased: tasks.filter((task) => task.lease && task.lease.expiresAt > now).length,
      expiredLeases: tasks.filter(
        (task) => task.lease !== undefined && task.lease.expiresAt <= now,
      ).length,
    };
  }
}
