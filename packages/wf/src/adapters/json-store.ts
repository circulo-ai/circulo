import type {
  EventStore,
  Lock,
  Workflow,
  WorkflowEvent,
  WorkflowFilter,
  WorkflowStore,
} from "../models";
import { generateId } from "../utils/id";

/**
 * Minimal durable key/value contract used by the JSON-backed adapters.
 *
 * Implement this contract over Postgres, Redis, SQLite, DynamoDB, a document
 * store, or a hosted KV service. The compare-and-set operation is required so
 * workflow updates remain safe when multiple workers race to resume a run.
 */
export interface JsonKeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  compareAndSet<T>(
    key: string,
    expectedVersion: number,
    value: T,
  ): Promise<boolean>;
  delete(key: string): Promise<void>;
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
}

/** Distributed lock contract used by JsonWorkflowStore. */
export interface WorkflowLockStore {
  acquireLock(
    workflowId: string,
    ttl: number,
    holder: string,
  ): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
  renewLock(lock: Lock, ttl: number): Promise<boolean>;
}

export interface JsonWorkflowStoreOptions<TContext, TInput, TOutput> {
  keyPrefix?: string;
  stepsFactory: () => Workflow<TContext, TInput, TOutput>["steps"];
  holderId?: string;
}

type PersistedWorkflow<TContext, TInput, TOutput> = Omit<
  Workflow<TContext, TInput, TOutput>,
  "steps"
>;

/**
 * Production adapter for stores that expose JSON values and atomic versioned
 * writes. Workflow step functions are rebuilt from stepsFactory after a
 * restart; only execution state is persisted.
 */
export class JsonWorkflowStore<
  TContext,
  TInput,
  TOutput,
> implements WorkflowStore<TContext, TInput, TOutput> {
  private readonly prefix: string;
  private readonly holderId: string;

  constructor(
    private readonly store: JsonKeyValueStore,
    private readonly locks: WorkflowLockStore,
    private readonly stepsFactory: JsonWorkflowStoreOptions<
      TContext,
      TInput,
      TOutput
    >["stepsFactory"],
    options?: Pick<
      JsonWorkflowStoreOptions<TContext, TInput, TOutput>,
      "keyPrefix" | "holderId"
    >,
  ) {
    this.prefix = options?.keyPrefix ?? "wf:workflow:";
    this.holderId = options?.holderId ?? generateId("holder");
  }

  async saveWorkflow(wf: Workflow<TContext, TInput, TOutput>): Promise<void> {
    await this.store.set(this.key(wf.id), this.toSnapshot(wf));
  }

  async loadWorkflow(
    id: string,
  ): Promise<Workflow<TContext, TInput, TOutput> | null> {
    const snapshot = await this.store.get<
      PersistedWorkflow<TContext, TInput, TOutput>
    >(this.key(id));
    return snapshot ? this.fromSnapshot(snapshot) : null;
  }

  async updateWorkflow(
    wf: Workflow<TContext, TInput, TOutput>,
    expectedVersion: number,
  ): Promise<boolean> {
    const updated = {
      ...this.toSnapshot(wf),
      version: expectedVersion + 1,
      updatedAt: Date.now(),
    };
    const success = await this.store.compareAndSet(
      this.key(wf.id),
      expectedVersion,
      updated,
    );
    if (success) {
      wf.version = updated.version;
      wf.updatedAt = updated.updatedAt;
    }
    return success;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.store.delete(this.key(id));
  }

  async listWorkflows(
    filter?: WorkflowFilter,
  ): Promise<Workflow<TContext, TInput, TOutput>[]> {
    const entries = await this.store.list<
      PersistedWorkflow<TContext, TInput, TOutput>
    >(this.prefix);
    const workflows = entries
      .map(({ value }) => this.fromSnapshot(value))
      .filter((wf) => matchesWorkflowFilter(wf, filter))
      .sort((a, b) => a.createdAt - b.createdAt);
    return filter?.limit === undefined
      ? workflows
      : workflows.slice(0, filter.limit);
  }

  acquireLock(workflowId: string, ttl: number): Promise<Lock | null> {
    return this.locks.acquireLock(workflowId, ttl, this.holderId);
  }

  releaseLock(lock: Lock): Promise<void> {
    return this.locks.releaseLock(lock);
  }

  renewLock(lock: Lock, ttl: number): Promise<boolean> {
    return this.locks.renewLock(lock, ttl);
  }

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }

  private toSnapshot(
    wf: Workflow<TContext, TInput, TOutput>,
  ): PersistedWorkflow<TContext, TInput, TOutput> {
    const { steps: _steps, ...snapshot } = wf;
    return structuredClone(snapshot);
  }

  private fromSnapshot(
    snapshot: PersistedWorkflow<TContext, TInput, TOutput>,
  ): Workflow<TContext, TInput, TOutput> {
    return {
      ...structuredClone(snapshot),
      steps: this.stepsFactory().map((step) => ({ ...step })),
    };
  }
}

/** JSON-backed event store suitable for append-only database/KV adapters. */
export class JsonEventStore<TOutput> implements EventStore<TOutput> {
  constructor(
    private readonly store: JsonKeyValueStore,
    private readonly keyPrefix = "wf:event:",
  ) {}

  async append(event: WorkflowEvent<TOutput>): Promise<void> {
    await this.store.set(this.eventKey(event), structuredClone(event));
  }

  async appendBatch(events: WorkflowEvent<TOutput>[]): Promise<void> {
    await Promise.all(events.map((event) => this.append(event)));
  }

  async list(
    workflowId: string,
    fromTimestamp?: number,
  ): Promise<WorkflowEvent<TOutput>[]> {
    const entries = await this.store.list<WorkflowEvent<TOutput>>(
      `${this.keyPrefix}${workflowId}:`,
    );
    return entries
      .map(({ value }) => structuredClone(value))
      .filter(
        (event) =>
          fromTimestamp === undefined || event.timestamp >= fromTimestamp,
      )
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  }

  async clear(workflowId: string): Promise<void> {
    const entries = await this.store.list<WorkflowEvent<TOutput>>(
      `${this.keyPrefix}${workflowId}:`,
    );
    await Promise.all(entries.map(({ key }) => this.store.delete(key)));
  }

  async count(workflowId: string): Promise<number> {
    const entries = await this.store.list<WorkflowEvent<TOutput>>(
      `${this.keyPrefix}${workflowId}:`,
    );
    return entries.length;
  }

  private eventKey(event: WorkflowEvent<TOutput>): string {
    return `${this.keyPrefix}${event.workflowId}:${String(event.timestamp).padStart(16, "0")}:${event.id}`;
  }
}

/** Small reference KV implementation for tests and local development. */
export class MapJsonKeyValueStore implements JsonKeyValueStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.values.get(key);
    return value === undefined ? null : structuredClone(value as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async compareAndSet<T>(
    key: string,
    expectedVersion: number,
    value: T,
  ): Promise<boolean> {
    const current = this.values.get(key) as { version?: number } | undefined;
    if (!current || current.version !== expectedVersion) return false;
    this.values.set(key, structuredClone(value));
    return true;
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value: structuredClone(value as T) }));
  }
}

export class MapWorkflowLockStore implements WorkflowLockStore {
  private readonly locks = new Map<string, Lock>();

  async acquireLock(
    workflowId: string,
    ttl: number,
    holder: string,
  ): Promise<Lock | null> {
    const current = this.locks.get(workflowId);
    const now = Date.now();
    if (current && current.expiresAt > now) return null;
    const lock: Lock = {
      id: generateId("lock"),
      workflowId,
      acquiredAt: now,
      expiresAt: now + ttl,
      holder,
    };
    this.locks.set(workflowId, lock);
    return lock;
  }

  async releaseLock(lock: Lock): Promise<void> {
    const current = this.locks.get(lock.workflowId);
    if (current?.id === lock.id && current.holder === lock.holder) {
      this.locks.delete(lock.workflowId);
    }
  }

  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    const current = this.locks.get(lock.workflowId);
    if (!current || current.id !== lock.id || current.holder !== lock.holder) {
      return false;
    }
    current.expiresAt = Date.now() + ttl;
    lock.expiresAt = current.expiresAt;
    return true;
  }
}

function matchesWorkflowFilter<TContext, TInput, TOutput>(
  workflow: Workflow<TContext, TInput, TOutput>,
  filter?: WorkflowFilter,
): boolean {
  if (!filter) return true;
  if (filter.state && workflow.state !== filter.state) return false;
  if (
    filter.createdAfter !== undefined &&
    workflow.createdAt < filter.createdAfter
  )
    return false;
  if (
    filter.createdBefore !== undefined &&
    workflow.createdAt > filter.createdBefore
  )
    return false;
  if (
    filter.resumeBefore !== undefined &&
    (workflow.resumeAt === undefined || workflow.resumeAt > filter.resumeBefore)
  )
    return false;
  if (
    filter.tags &&
    !Object.entries(filter.tags).every(
      ([key, value]) => workflow.tags[key] === value,
    )
  )
    return false;
  return true;
}
