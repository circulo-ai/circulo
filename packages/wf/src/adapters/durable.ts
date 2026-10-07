import type {
  ClaimedTask,
  HistoryAppendResult,
  HistoryReadOptions,
  TaskClaimOptions,
  TaskEnvelope,
  TaskFailure,
  TaskQueueAdapter,
  TaskQueueStats,
  TaskRescheduleOptions,
  WorkflowHistoryEvent,
  WorkflowHistoryEventInput,
  WorkflowHistoryStore,
} from "../models";
import { generateId } from "../utils/id";
import type { JsonKeyValueStore, WorkflowLockStore } from "./json-store";

export interface JsonWorkflowHistoryStoreOptions {
  keyPrefix?: string;
  lockTtlMs?: number;
  holderId?: string;
}

interface HistoryRecord {
  version: number;
  events: WorkflowHistoryEvent<unknown>[];
}

/** Durable append-only history backed by a JSON key/value store and lock port. */
export class JsonWorkflowHistoryStore implements WorkflowHistoryStore {
  private readonly keyPrefix: string;
  private readonly lockTtlMs: number;
  private readonly holderId: string;

  constructor(
    private readonly store: JsonKeyValueStore,
    private readonly locks: WorkflowLockStore,
    options: JsonWorkflowHistoryStoreOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? "wf:history:";
    this.lockTtlMs = options.lockTtlMs ?? 30_000;
    this.holderId = options.holderId ?? generateId("history-holder");
    assertPositiveInteger(this.lockTtlMs, "history lock ttl");
  }

  async append<TPayload>(
    event: WorkflowHistoryEventInput<TPayload>,
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    return this.appendBatch([event], expectedNextSequence);
  }

  async appendBatch<TPayload>(
    events: readonly WorkflowHistoryEventInput<TPayload>[],
    expectedNextSequence: number,
  ): Promise<HistoryAppendResult | null> {
    assertNonNegativeInteger(expectedNextSequence, "expectedNextSequence");
    if (events.length === 0) {
      return { appended: [], nextSequence: expectedNextSequence };
    }
    const first = events[0]!;
    if (
      events.some(
        (event) =>
          event.workflowId !== first.workflowId || event.runId !== first.runId,
      )
    ) {
      throw new Error("History append batch must target one workflow run");
    }

    const lock = await this.locks.acquireLock(
      this.lockKey(first.workflowId, first.runId),
      this.lockTtlMs,
      this.holderId,
    );
    if (!lock) return null;
    try {
      const current = await this.store.get<HistoryRecord>(
        this.runKey(first.workflowId, first.runId),
      );
      const existingEvents = current?.events ?? [];
      const currentSequence = existingEvents.length;
      if (currentSequence !== expectedNextSequence) return null;

      const duplicateResults: WorkflowHistoryEvent<unknown>[] = [];
      for (const input of events) {
        const existing = input.eventId
          ? existingEvents.find(
              (candidate) => candidate.eventId === input.eventId,
            )
          : undefined;
        if (!existing) continue;
        if (
          existing.eventType !== input.eventType ||
          stableSerialize(existing.payload) !== stableSerialize(input.payload)
        ) {
          throw new Error(
            `History event id ${input.eventId} was reused with different content`,
          );
        }
        duplicateResults.push(existing);
      }
      if (duplicateResults.length === events.length) {
        return {
          appended: structuredClone(duplicateResults),
          nextSequence: currentSequence,
        };
      }
      if (duplicateResults.length > 0) {
        throw new Error(
          "History append batch partially overlaps existing events",
        );
      }

      const appended = events.map((input, index) => ({
        ...structuredClone(input),
        eventId: input.eventId ?? generateId("history"),
        sequence: expectedNextSequence + index,
        timestamp: input.timestamp ?? Date.now(),
        payload: structuredClone(input.payload),
      })) as WorkflowHistoryEvent<unknown>[];
      const nextRecord: HistoryRecord = {
        version: expectedNextSequence + appended.length,
        events: [...existingEvents, ...appended],
      };

      if (current) {
        const saved = await this.store.compareAndSet(
          this.runKey(first.workflowId, first.runId),
          current.version,
          nextRecord,
        );
        if (!saved) return null;
      } else {
        await this.store.set(
          this.runKey(first.workflowId, first.runId),
          nextRecord,
        );
      }
      return {
        appended: structuredClone(appended),
        nextSequence: nextRecord.version,
      };
    } finally {
      await this.locks.releaseLock(lock);
    }
  }

  async read<TPayload = unknown>(
    options: HistoryReadOptions,
  ): Promise<WorkflowHistoryEvent<TPayload>[]> {
    const records = options.runId
      ? [
          await this.store.get<HistoryRecord>(
            this.runKey(options.workflowId, options.runId),
          ),
        ]
      : (
          await this.store.list<HistoryRecord>(
            this.workflowPrefix(options.workflowId),
          )
        ).map((entry) => entry.value);
    const events = records
      .flatMap((record) => record?.events ?? [])
      .filter(
        (event) =>
          options.fromSequence === undefined ||
          event.sequence >= options.fromSequence,
      )
      .sort((left, right) =>
        options.runId
          ? left.sequence - right.sequence
          : left.workflowId.localeCompare(right.workflowId) ||
            left.runId.localeCompare(right.runId) ||
            left.sequence - right.sequence,
      );
    return structuredClone(
      options.limit === undefined ? events : events.slice(0, options.limit),
    ) as WorkflowHistoryEvent<TPayload>[];
  }

  async nextSequence(workflowId: string, runId: string): Promise<number> {
    const record = await this.store.get<HistoryRecord>(
      this.runKey(workflowId, runId),
    );
    return record?.events.length ?? 0;
  }

  async clear(workflowId: string, runId?: string): Promise<void> {
    if (runId) {
      await this.store.delete(this.runKey(workflowId, runId));
      return;
    }
    const records = await this.store.list<HistoryRecord>(
      this.workflowPrefix(workflowId),
    );
    await Promise.all(records.map((record) => this.store.delete(record.key)));
  }

  private workflowPrefix(workflowId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(workflowId)}:`;
  }

  private runKey(workflowId: string, runId: string): string {
    return `${this.workflowPrefix(workflowId)}${encodeURIComponent(runId)}`;
  }

  private lockKey(workflowId: string, runId: string): string {
    return `history:${encodeURIComponent(workflowId)}:${encodeURIComponent(runId)}`;
  }
}

export interface JsonTaskQueueOptions {
  keyPrefix?: string;
  lockTtlMs?: number;
  holderId?: string;
}

interface TaskRecord {
  version: number;
  task: TaskEnvelope<unknown>;
}

/** Durable delayed task queue backed by the JSON key/value and lock ports. */
export class JsonTaskQueue implements TaskQueueAdapter {
  private readonly keyPrefix: string;
  private readonly lockTtlMs: number;
  private readonly holderId: string;

  constructor(
    private readonly store: JsonKeyValueStore,
    private readonly locks: WorkflowLockStore,
    options: JsonTaskQueueOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? "wf:task:";
    this.lockTtlMs = options.lockTtlMs ?? 30_000;
    this.holderId = options.holderId ?? generateId("task-holder");
    assertPositiveInteger(this.lockTtlMs, "task queue lock ttl");
  }

  async enqueue<TPayload>(task: TaskEnvelope<TPayload>): Promise<void> {
    validateTask(task);
    await this.withQueueLock(async () => {
      const key = this.taskKey(task.id);
      const existing = await this.store.get<TaskRecord>(key);
      if (existing) {
        if (
          existing.task.kind !== task.kind ||
          existing.task.queue !== task.queue ||
          stableSerialize(existing.task.payload) !==
            stableSerialize(task.payload)
        ) {
          throw new Error(`Task ${task.id} was reused with different content`);
        }
        return;
      }
      await this.store.set(key, { version: 0, task: structuredClone(task) });
    });
  }

  async claim<TPayload>(
    options: TaskClaimOptions,
  ): Promise<ClaimedTask<TPayload> | null> {
    assertPositiveInteger(options.leaseDurationMs, "lease duration");
    return this.withQueueLock(async () => {
      const now = options.now ?? Date.now();
      const candidates = (await this.store.list<TaskRecord>(this.keyPrefix))
        .filter(({ value }) => {
          const task = value.task;
          if (options.queue !== "*" && task.queue !== options.queue)
            return false;
          if (task.availableAt > now) return false;
          if (task.lease && task.lease.expiresAt > now) return false;
          return (
            options.tenantId === undefined || task.tenantId === options.tenantId
          );
        })
        .sort(
          ({ value: left }, { value: right }) =>
            left.task.priority - right.task.priority ||
            left.task.createdAt - right.task.createdAt ||
            left.task.id.localeCompare(right.task.id),
        )[0];
      if (!candidates) return null;

      const nowLease = now;
      const lease = {
        token: generateId("lease"),
        workerId: options.workerId,
        acquiredAt: nowLease,
        expiresAt: nowLease + options.leaseDurationMs,
      };
      const task = structuredClone(candidates.value.task);
      task.attempt += 1;
      task.lease = lease;
      const saved = await this.store.compareAndSet(
        candidates.key,
        candidates.value.version,
        { version: candidates.value.version + 1, task },
      );
      return saved
        ? {
            task: structuredClone(task) as TaskEnvelope<TPayload>,
            lease: structuredClone(lease),
          }
        : null;
    });
  }

  heartbeat(
    taskId: string,
    leaseToken: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    assertPositiveInteger(leaseDurationMs, "lease duration");
    return this.withQueueLock(async () => {
      const entry = await this.store.get<TaskRecord>(this.taskKey(taskId));
      if (!entry || entry.task.lease?.token !== leaseToken) return false;
      const task = structuredClone(entry.task);
      task.lease!.expiresAt = Date.now() + leaseDurationMs;
      return this.store.compareAndSet(this.taskKey(taskId), entry.version, {
        version: entry.version + 1,
        task,
      });
    });
  }

  acknowledge(taskId: string, leaseToken: string): Promise<boolean> {
    return this.withQueueLock(async () => {
      const entry = await this.store.get<TaskRecord>(this.taskKey(taskId));
      if (!entry || entry.task.lease?.token !== leaseToken) return false;
      await this.store.delete(this.taskKey(taskId));
      return true;
    });
  }

  reschedule(
    taskId: string,
    leaseToken: string,
    options: TaskRescheduleOptions,
  ): Promise<boolean> {
    return this.updateLeasedTask(taskId, leaseToken, (task) => {
      task.availableAt = options.availableAt;
      task.lease = undefined;
    });
  }

  reject(
    taskId: string,
    leaseToken: string,
    _failure: TaskFailure,
  ): Promise<boolean> {
    return this.acknowledge(taskId, leaseToken);
  }

  reclaimExpiredLeases(now = Date.now()): Promise<number> {
    return this.withQueueLock(async () => {
      let reclaimed = 0;
      const entries = await this.store.list<TaskRecord>(this.keyPrefix);
      for (const entry of entries) {
        if (!entry.value.task.lease || entry.value.task.lease.expiresAt > now)
          continue;
        const task = structuredClone(entry.value.task);
        task.lease = undefined;
        task.availableAt = Math.min(task.availableAt, now);
        if (
          await this.store.compareAndSet(entry.key, entry.value.version, {
            version: entry.value.version + 1,
            task,
          })
        ) {
          reclaimed += 1;
        }
      }
      return reclaimed;
    });
  }

  async stats(queue?: string): Promise<TaskQueueStats> {
    const now = Date.now();
    const tasks = (await this.store.list<TaskRecord>(this.keyPrefix))
      .map((entry) => entry.value.task)
      .filter((task) => queue === undefined || task.queue === queue);
    return {
      queued: tasks.filter((task) => !task.lease && task.availableAt <= now)
        .length,
      leased: tasks.filter((task) => task.lease && task.lease.expiresAt > now)
        .length,
      expiredLeases: tasks.filter(
        (task) => task.lease !== undefined && task.lease.expiresAt <= now,
      ).length,
    };
  }

  private updateLeasedTask(
    taskId: string,
    leaseToken: string,
    update: (task: TaskEnvelope<unknown>) => void,
  ): Promise<boolean> {
    return this.withQueueLock(async () => {
      const key = this.taskKey(taskId);
      const entry = await this.store.get<TaskRecord>(key);
      if (!entry || entry.task.lease?.token !== leaseToken) return false;
      const task = structuredClone(entry.task);
      update(task);
      return this.store.compareAndSet(key, entry.version, {
        version: entry.version + 1,
        task,
      });
    });
  }

  private async withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
    const lock = await this.locks.acquireLock(
      "task-queue",
      this.lockTtlMs,
      this.holderId,
    );
    if (!lock) {
      throw new Error("Could not acquire task queue lock");
    }
    try {
      return await operation();
    } finally {
      await this.locks.releaseLock(lock);
    }
  }

  private taskKey(id: string): string {
    return `${this.keyPrefix}${encodeURIComponent(id)}`;
  }
}

function validateTask(task: TaskEnvelope<unknown>): void {
  if (!task.id.trim()) throw new RangeError("Task id must not be empty");
  if (!Number.isInteger(task.attempt) || task.attempt < 0) {
    throw new RangeError("Task attempt must be a non-negative integer");
  }
  if (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1) {
    throw new RangeError("Task maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(task.availableAt) || task.availableAt < 0) {
    throw new RangeError("Task availableAt must be a non-negative timestamp");
  }
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer`);
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer`);
}
