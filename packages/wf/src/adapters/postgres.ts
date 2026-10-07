import type {
  EventBus,
  EventCallback,
  IdempotencyClaim,
  IdempotencyStore,
  Lock,
  Unsubscribe,
  Workflow,
  WorkflowEvent,
  WorkflowRunReference,
} from "../models";
import { generateId } from "../utils/id";
import {
  JsonTaskQueue,
  JsonWorkflowHistoryStore,
  type JsonTaskQueueOptions,
  type JsonWorkflowHistoryStoreOptions,
} from "./durable";
import { AdapterEventBus, type PubSubAdapter } from "./event-bus";
import type { JsonKeyValueStore, WorkflowLockStore } from "./json-store";
import { JsonEventStore, JsonWorkflowStore } from "./json-store";

export type PostgresRow = Record<string, unknown>;

/** Driver-neutral query surface compatible with pg, postgres.js wrappers, and test doubles. */
export interface PostgresQueryClient {
  query<TRow extends PostgresRow = PostgresRow>(
    text: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: readonly TRow[]; rowCount: number }>;
}

/** Minimal postgres.js surface for the supplied query-client bridge. */
export interface PostgresJsClientLike {
  unsafe<TRow extends PostgresRow = PostgresRow>(
    text: string,
    parameters?: readonly unknown[],
  ): Promise<readonly TRow[]>;
}

export function createPostgresJsQueryClient(
  client: PostgresJsClientLike,
): PostgresQueryClient {
  return {
    async query<TRow extends PostgresRow = PostgresRow>(
      text: string,
      parameters: readonly unknown[] = [],
    ) {
      const rows = await client.unsafe<TRow>(text, [...parameters]);
      return { rows, rowCount: rows.length };
    },
  };
}

export interface PostgresAdapterSchema {
  jsonValuesTable?: string;
  locksTable?: string;
  idempotencyTable?: string;
}

const defaultSchema: Required<PostgresAdapterSchema> = {
  jsonValuesTable: "wf_json_values",
  locksTable: "wf_workflow_locks",
  idempotencyTable: "wf_idempotency",
};

/** PostgreSQL JSON key/value adapter with atomic versioned updates. */
export class PostgresJsonKeyValueStore implements JsonKeyValueStore {
  private readonly table: string;

  constructor(
    private readonly client: PostgresQueryClient,
    table = defaultSchema.jsonValuesTable,
  ) {
    this.table = quoteIdentifier(table);
  }

  async initialize(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.client.query<{ value: unknown }>(
      `SELECT value FROM ${this.table} WHERE key = $1`,
      [key],
    );
    const value = result.rows[0]?.value;
    return value === undefined ? null : cloneJson<T>(value);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.client.query(
      `
        INSERT INTO ${this.table} (key, value, version)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          version = EXCLUDED.version,
          updated_at = NOW()
      `,
      [key, stringifyJson(value, key), versionOf(value, 0)],
    );
  }

  async compareAndSet<T>(
    key: string,
    expectedVersion: number,
    value: T,
  ): Promise<boolean> {
    assertVersion(expectedVersion, "expectedVersion");
    const result = await this.client.query(
      `
        UPDATE ${this.table}
        SET value = $2::jsonb, version = $3, updated_at = NOW()
        WHERE key = $1 AND version = $4
        RETURNING key
      `,
      [
        key,
        stringifyJson(value, key),
        versionOf(value, expectedVersion + 1),
        expectedVersion,
      ],
    );
    return result.rowCount > 0;
  }

  async delete(key: string): Promise<void> {
    await this.client.query(`DELETE FROM ${this.table} WHERE key = $1`, [key]);
  }

  async list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    const result = await this.client.query<{ key: string; value: unknown }>(
      `
        SELECT key, value
        FROM ${this.table}
        WHERE key LIKE ($1 || '%') ESCAPE '\\'
        ORDER BY key ASC
      `,
      [escapeLikePrefix(prefix)],
    );
    return result.rows.map((row) => ({
      key: row.key,
      value: cloneJson<T>(row.value),
    }));
  }
}

/** PostgreSQL-backed append-only replay history. */
export class PostgresWorkflowHistoryStore extends JsonWorkflowHistoryStore {
  constructor(
    client: PostgresQueryClient,
    options: JsonWorkflowHistoryStoreOptions & {
      table?: string;
      lockTable?: string;
      holderId?: string;
      keyValueStore?: JsonKeyValueStore;
      lockStore?: WorkflowLockStore;
    } = {},
  ) {
    super(
      options.keyValueStore ??
        new PostgresJsonKeyValueStore(client, options.table),
      options.lockStore ??
        new PostgresWorkflowLockStore(
          client,
          options.lockTable,
          options.holderId,
        ),
      options,
    );
  }
}

/** PostgreSQL-backed delayed task queue for activities and durable timers. */
export class PostgresTaskQueue extends JsonTaskQueue {
  constructor(
    client: PostgresQueryClient,
    options: JsonTaskQueueOptions & {
      table?: string;
      lockTable?: string;
      holderId?: string;
      keyValueStore?: JsonKeyValueStore;
      lockStore?: WorkflowLockStore;
    } = {},
  ) {
    super(
      options.keyValueStore ??
        new PostgresJsonKeyValueStore(client, options.table),
      options.lockStore ??
        new PostgresWorkflowLockStore(
          client,
          options.lockTable,
          options.holderId,
        ),
      options,
    );
  }
}

/** PostgreSQL row lease implementation used by JsonWorkflowStore. */
export class PostgresWorkflowLockStore implements WorkflowLockStore {
  private readonly table: string;

  constructor(
    private readonly client: PostgresQueryClient,
    table = defaultSchema.locksTable,
    private readonly holderId = generateId("holder"),
  ) {
    this.table = quoteIdentifier(table);
  }

  async initialize(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        workflow_id TEXT PRIMARY KEY,
        lock_id TEXT NOT NULL,
        holder TEXT NOT NULL,
        acquired_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${unquote(this.table)}_expires_idx`)} ON ${this.table} (expires_at)`,
    );
  }

  async acquireLock(
    workflowId: string,
    ttl: number,
    holder = this.holderId,
  ): Promise<Lock | null> {
    assertPositiveInteger(ttl, "lock ttl");
    const now = Date.now();
    const lock: Lock = {
      id: generateId("lock"),
      workflowId,
      acquiredAt: now,
      expiresAt: now + ttl,
      holder,
    };
    const result = await this.client.query(
      `
        INSERT INTO ${this.table}
          (workflow_id, lock_id, holder, acquired_at, expires_at)
        VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))
        ON CONFLICT (workflow_id) DO UPDATE SET
          lock_id = EXCLUDED.lock_id,
          holder = EXCLUDED.holder,
          acquired_at = EXCLUDED.acquired_at,
          expires_at = EXCLUDED.expires_at
        WHERE ${this.table}.expires_at <= NOW()
        RETURNING workflow_id
      `,
      [workflowId, lock.id, holder, now, now + ttl],
    );
    return result.rowCount > 0 ? lock : null;
  }

  async releaseLock(lock: Lock): Promise<void> {
    await this.client.query(
      `
        DELETE FROM ${this.table}
        WHERE workflow_id = $1 AND lock_id = $2 AND holder = $3
      `,
      [lock.workflowId, lock.id, lock.holder],
    );
  }

  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    assertPositiveInteger(ttl, "lock ttl");
    const expiresAt = Date.now() + ttl;
    const result = await this.client.query(
      `
        UPDATE ${this.table}
        SET expires_at = to_timestamp($4 / 1000.0)
        WHERE workflow_id = $1 AND lock_id = $2 AND holder = $3
        RETURNING workflow_id
      `,
      [lock.workflowId, lock.id, lock.holder, expiresAt],
    );
    if (result.rowCount === 0) return false;
    lock.expiresAt = expiresAt;
    return true;
  }
}

/** Small explicit port for PostgreSQL LISTEN/NOTIFY implementations. */
export interface PostgresNotificationTransport {
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, callback: (payload: string) => void): Unsubscribe;
  close?(): Promise<void>;
}

/** LISTEN/NOTIFY transport for AdapterEventBus. */
export class PostgresNotificationAdapter<
  TOutput,
> implements PubSubAdapter<TOutput> {
  private readonly callbacks = new Map<string, Set<EventCallback<TOutput>>>();
  private readonly localDeliveries = new Set<string>();

  constructor(private readonly transport: PostgresNotificationTransport) {}

  async publish(topic: string, event: WorkflowEvent<TOutput>): Promise<void> {
    const deliveryKey = `${topic}:${event.id}`;
    this.localDeliveries.add(deliveryKey);
    try {
      await this.transport.publish(topic, JSON.stringify(event));
      await this.dispatch(topic, event);
    } catch (error) {
      this.localDeliveries.delete(deliveryKey);
      throw error;
    }
    const timer = setTimeout(
      () => this.localDeliveries.delete(deliveryKey),
      60_000,
    );
    timer.unref?.();
  }

  subscribe(topic: string, callback: EventCallback<TOutput>): Unsubscribe {
    const callbacks = this.callbacks.get(topic) ?? new Set();
    callbacks.add(callback);
    this.callbacks.set(topic, callbacks);
    if (callbacks.size === 1) {
      const unsubscribeTransport = this.transport.subscribe(
        topic,
        (payload) => {
          let event: WorkflowEvent<TOutput>;
          try {
            event = JSON.parse(payload) as WorkflowEvent<TOutput>;
          } catch {
            return;
          }
          if (this.localDeliveries.delete(`${topic}:${event.id}`)) return;
          void this.dispatch(topic, event);
        },
      );
      this.transportUnsubscribers.set(topic, unsubscribeTransport);
    }
    return () => {
      const current = this.callbacks.get(topic);
      if (!current) return;
      current.delete(callback);
      if (current.size > 0) return;
      this.callbacks.delete(topic);
      this.transportUnsubscribers.get(topic)?.();
      this.transportUnsubscribers.delete(topic);
    };
  }

  async close(): Promise<void> {
    for (const unsubscribe of this.transportUnsubscribers.values())
      unsubscribe();
    this.transportUnsubscribers.clear();
    this.callbacks.clear();
    this.localDeliveries.clear();
    await this.transport.close?.();
  }

  private readonly transportUnsubscribers = new Map<string, Unsubscribe>();

  private async dispatch(
    topic: string,
    event: WorkflowEvent<TOutput>,
  ): Promise<void> {
    const callbacks = [...(this.callbacks.get(topic) ?? [])];
    await Promise.allSettled(
      callbacks.map((callback) => callback(structuredClone(event))),
    );
  }
}

/** PostgreSQL-backed idempotency claims with an atomic insert/upsert. */
export class PostgresIdempotencyStore implements IdempotencyStore {
  private readonly table: string;

  constructor(
    private readonly client: PostgresQueryClient,
    table = defaultSchema.idempotencyTable,
  ) {
    this.table = quoteIdentifier(table);
  }

  async initialize(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        key TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        tenant_id TEXT,
        fingerprint TEXT,
        expires_at TIMESTAMPTZ
      )
    `);
    await this.client.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${unquote(this.table)}_expires_idx`)} ON ${this.table} (expires_at)`,
    );
  }

  async claim(
    key: string,
    reference: WorkflowRunReference,
    expiresAt?: number,
    fingerprint?: string,
  ): Promise<IdempotencyClaim> {
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      throw new RangeError("Idempotency expiration must be in the future");
    }
    const inserted = await this.client.query(
      `
        INSERT INTO ${this.table}
          (key, workflow_id, run_id, tenant_id, fingerprint, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (key) DO UPDATE SET
          workflow_id = EXCLUDED.workflow_id,
          run_id = EXCLUDED.run_id,
          tenant_id = EXCLUDED.tenant_id,
          fingerprint = EXCLUDED.fingerprint,
          expires_at = EXCLUDED.expires_at
        WHERE ${this.table}.expires_at IS NOT NULL
          AND ${this.table}.expires_at <= NOW()
        RETURNING workflow_id, run_id, tenant_id, fingerprint
      `,
      [
        key,
        reference.workflowId,
        reference.runId,
        reference.tenantId ?? null,
        fingerprint ?? null,
        expiresAt === undefined ? null : new Date(expiresAt),
      ],
    );
    if (inserted.rowCount > 0) {
      return { claimed: true, reference: structuredClone(reference) };
    }
    const existing = await this.client.query<{
      workflow_id: string;
      run_id: string;
      tenant_id: string | null;
      fingerprint: string | null;
    }>(
      `SELECT workflow_id, run_id, tenant_id, fingerprint FROM ${this.table} WHERE key = $1`,
      [key],
    );
    const row = existing.rows[0];
    if (!row) return this.claim(key, reference, expiresAt, fingerprint);
    return {
      claimed: false,
      reference: {
        workflowId: row.workflow_id,
        runId: row.run_id,
        ...(row.tenant_id === null ? {} : { tenantId: row.tenant_id }),
      },
      ...(fingerprint !== undefined &&
      row.fingerprint !== null &&
      fingerprint !== row.fingerprint
        ? { conflict: true }
        : {}),
    };
  }

  async release(
    key: string,
    reference: WorkflowRunReference,
  ): Promise<boolean> {
    const result = await this.client.query(
      `
        DELETE FROM ${this.table}
        WHERE key = $1 AND workflow_id = $2 AND run_id = $3
          AND tenant_id IS NOT DISTINCT FROM $4
        RETURNING key
      `,
      [key, reference.workflowId, reference.runId, reference.tenantId ?? null],
    );
    return result.rowCount > 0;
  }

  async clearExpired(now = Date.now()): Promise<number> {
    const result = await this.client.query(
      `DELETE FROM ${this.table} WHERE expires_at IS NOT NULL AND expires_at <= $1`,
      [new Date(now)],
    );
    return result.rowCount;
  }
}

export interface PostgresWorkflowAdaptersOptions<
  TContext,
  TInput,
  TOutput,
> extends PostgresAdapterSchema {
  client: PostgresQueryClient;
  notifications: PostgresNotificationTransport;
  stepsFactory: () => Workflow<TContext, TInput, TOutput>["steps"];
  workflowKeyPrefix?: string;
  eventKeyPrefix?: string;
  holderId?: string;
  eventTopicPrefix?: string;
}

export interface PostgresWorkflowAdapters<TContext, TInput, TOutput> {
  readonly keyValueStore: PostgresJsonKeyValueStore;
  readonly lockStore: PostgresWorkflowLockStore;
  readonly workflowStore: JsonWorkflowStore<TContext, TInput, TOutput>;
  readonly eventStore: JsonEventStore<TOutput>;
  readonly notification: PostgresNotificationAdapter<TOutput>;
  readonly eventBus: EventBus<TOutput>;
  readonly idempotencyStore: PostgresIdempotencyStore;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export interface PostgresDurableAdaptersOptions extends PostgresAdapterSchema {
  client: PostgresQueryClient;
  historyKeyPrefix?: string;
  taskKeyPrefix?: string;
  lockKeyPrefix?: string;
  holderId?: string;
}

export interface PostgresDurableAdapters {
  readonly keyValueStore: PostgresJsonKeyValueStore;
  readonly lockStore: PostgresWorkflowLockStore;
  readonly history: PostgresWorkflowHistoryStore;
  readonly queue: PostgresTaskQueue;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

/** Compose PostgreSQL-backed replay history and delayed task adapters. */
export function createPostgresDurableAdapters(
  options: PostgresDurableAdaptersOptions,
): PostgresDurableAdapters {
  const keyValueStore = new PostgresJsonKeyValueStore(
    options.client,
    options.jsonValuesTable,
  );
  const lockStore = new PostgresWorkflowLockStore(
    options.client,
    options.locksTable,
    options.holderId,
  );
  return {
    keyValueStore,
    lockStore,
    history: new PostgresWorkflowHistoryStore(options.client, {
      keyValueStore,
      lockStore,
      ...(options.historyKeyPrefix === undefined
        ? {}
        : { keyPrefix: options.historyKeyPrefix }),
      ...(options.jsonValuesTable === undefined
        ? {}
        : { table: options.jsonValuesTable }),
      ...(options.locksTable === undefined
        ? {}
        : { lockTable: options.locksTable }),
      ...(options.holderId === undefined ? {} : { holderId: options.holderId }),
    }),
    queue: new PostgresTaskQueue(options.client, {
      keyValueStore,
      lockStore,
      ...(options.taskKeyPrefix === undefined
        ? {}
        : { keyPrefix: options.taskKeyPrefix }),
      ...(options.jsonValuesTable === undefined
        ? {}
        : { table: options.jsonValuesTable }),
      ...(options.locksTable === undefined
        ? {}
        : { lockTable: options.locksTable }),
      ...(options.holderId === undefined ? {} : { holderId: options.holderId }),
    }),
    initialize: async () => {
      await keyValueStore.initialize();
      await lockStore.initialize();
    },
    close: async () => undefined,
  };
}

/** Compose PostgreSQL workflow, event, lock, idempotency, and notification adapters. */
export function createPostgresWorkflowAdapters<TContext, TInput, TOutput>(
  options: PostgresWorkflowAdaptersOptions<TContext, TInput, TOutput>,
): PostgresWorkflowAdapters<TContext, TInput, TOutput> {
  const keyValueStore = new PostgresJsonKeyValueStore(
    options.client,
    options.jsonValuesTable,
  );
  const lockStore = new PostgresWorkflowLockStore(
    options.client,
    options.locksTable,
    options.holderId,
  );
  const workflowStore = new JsonWorkflowStore<TContext, TInput, TOutput>(
    keyValueStore,
    lockStore,
    options.stepsFactory,
    {
      ...(options.workflowKeyPrefix === undefined
        ? {}
        : { keyPrefix: options.workflowKeyPrefix }),
      ...(options.holderId === undefined ? {} : { holderId: options.holderId }),
    },
  );
  const eventStore = new JsonEventStore<TOutput>(
    keyValueStore,
    options.eventKeyPrefix,
  );
  const notification = new PostgresNotificationAdapter<TOutput>(
    options.notifications,
  );
  const eventBus = new AdapterEventBus<TOutput>(
    notification,
    options.eventTopicPrefix,
  );
  const idempotencyStore = new PostgresIdempotencyStore(
    options.client,
    options.idempotencyTable,
  );
  return {
    keyValueStore,
    lockStore,
    workflowStore,
    eventStore,
    notification,
    eventBus,
    idempotencyStore,
    initialize: async () => {
      await keyValueStore.initialize();
      await lockStore.initialize();
      await idempotencyStore.initialize();
    },
    close: () => notification.close(),
  };
}

function quoteIdentifier(identifier: string): string {
  const parts = identifier.split(".");
  if (
    parts.length === 0 ||
    parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
  ) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return parts.map((part) => `"${part}"`).join(".");
}

function unquote(identifier: string): string {
  return identifier.replaceAll('"', "");
}

function stringifyJson(value: unknown, key: string): string {
  const result = JSON.stringify(value);
  if (result === undefined)
    throw new TypeError(`Value for ${key} is not JSON serializable`);
  return result;
}

function escapeLikePrefix(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function cloneJson<T>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error("PostgreSQL JSON value is malformed");
    }
  }
  return structuredClone(value) as T;
}

function versionOf(value: unknown, fallback: number): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "number" &&
    Number.isInteger(value.version) &&
    value.version >= 0
  ) {
    return value.version;
  }
  return fallback;
}

function assertVersion(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer`);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive integer`);
}
