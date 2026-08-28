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
import type { JsonKeyValueStore, WorkflowLockStore } from "./json-store";
import { AdapterEventBus, type PubSubAdapter } from "./event-bus";
import { JsonEventStore, JsonWorkflowStore } from "./json-store";
import { generateId } from "../utils/id";

/**
 * The small Redis surface used by the first-party adapters.
 *
 * The shape intentionally matches ioredis, while remaining easy to implement
 * for node-redis or a test double. No Redis package is imported at runtime.
 */
export interface RedisCommandClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...arguments_: Array<string | number>): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, ...arguments_: Array<string | number>): Promise<[string, string[]]>;
  eval<T>(script: string, numberOfKeys: number, ...arguments_: string[]): Promise<T>;
}

export interface RedisPubSubClient extends RedisCommandClient {
  publish(channel: string, message: string): Promise<number>;
  duplicate(): RedisPubSubClient;
  subscribe(channel: string): Promise<number>;
  unsubscribe(channel: string): Promise<number>;
  on(event: "message", listener: (channel: string, message: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  quit(): Promise<unknown>;
  disconnect(): void;
}

export interface RedisAdapterLogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

const silentLogger: RedisAdapterLogger = {
  warn: () => undefined,
  error: () => undefined,
};

/** JSON key/value adapter with SCAN-based prefix listing and atomic CAS. */
export class RedisJsonKeyValueStore implements JsonKeyValueStore {
  constructor(
    private readonly redis: RedisCommandClient,
    private readonly scanCount = 100,
  ) {
    if (!Number.isInteger(scanCount) || scanCount < 1) {
      throw new RangeError("Redis scanCount must be a positive integer");
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value === null ? null : parseJson<T>(value, key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.redis.set(key, stringifyJson(value, key));
  }

  async compareAndSet<T>(
    key: string,
    expectedVersion: number,
    value: T,
  ): Promise<boolean> {
    assertVersion(expectedVersion, "expectedVersion");
    const result = await this.redis.eval<number>(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.version ~= tonumber(ARGV[1]) then return 0 end
redis.call("SET", KEYS[1], ARGV[2])
return 1
`,
      1,
      key,
      String(expectedVersion),
      stringifyJson(value, key),
    );
    return result === 1;
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, page] = await this.redis.scan(
        cursor,
        "MATCH",
        `${escapeRedisPattern(prefix)}*`,
        "COUNT",
        this.scanCount,
      );
      keys.push(...page);
      cursor = nextCursor;
    } while (cursor !== "0");

    const entries: Array<{ key: string; value: T }> = [];
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) entries.push({ key, value });
    }
    return entries;
  }
}

/** Redis lease implementation used by JsonWorkflowStore. */
export class RedisWorkflowLockStore implements WorkflowLockStore {
  constructor(
    private readonly redis: RedisCommandClient,
    private readonly keyPrefix = "wf:lock:",
    private readonly holderId = generateId("holder"),
  ) {}

  async acquireLock(
    workflowId: string,
    ttl: number,
    holder = this.holderId,
  ): Promise<Lock | null> {
    assertPositiveInteger(ttl, "lock ttl");
    const lock: Lock = {
      id: generateId("lock"),
      workflowId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttl,
      holder,
    };
    const result = await this.redis.set(
      this.key(workflowId),
      JSON.stringify(lock),
      "PX",
      ttl,
      "NX",
    );
    return result === "OK" ? lock : null;
  }

  async releaseLock(lock: Lock): Promise<void> {
    await this.redis.eval<number>(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.id ~= ARGV[1] or current.holder ~= ARGV[2] then return 0 end
redis.call("DEL", KEYS[1])
return 1
`,
      1,
      this.key(lock.workflowId),
      lock.id,
      lock.holder,
    );
  }

  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    assertPositiveInteger(ttl, "lock ttl");
    const expiresAt = Date.now() + ttl;
    const result = await this.redis.eval<number>(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.id ~= ARGV[1] or current.holder ~= ARGV[2] then return 0 end
current.expiresAt = tonumber(ARGV[3])
redis.call("SET", KEYS[1], cjson.encode(current), "PX", ARGV[4])
return 1
`,
      1,
      this.key(lock.workflowId),
      lock.id,
      lock.holder,
      String(expiresAt),
      String(ttl),
    );
    if (result !== 1) return false;
    lock.expiresAt = expiresAt;
    return true;
  }

  private key(workflowId: string): string {
    return `${this.keyPrefix}${workflowId}`;
  }
}

/** Redis pub/sub transport for AdapterEventBus. */
export class RedisPubSubAdapter<TOutput> implements PubSubAdapter<TOutput> {
  private readonly subscriber: RedisPubSubClient;
  private readonly callbacks = new Map<string, Set<EventCallback<TOutput>>>();
  private readonly localDeliveries = new Set<string>();
  private closed = false;

  constructor(
    private readonly redis: RedisPubSubClient,
    private readonly logger: RedisAdapterLogger = silentLogger,
  ) {
    this.subscriber = redis.duplicate();
    this.subscriber.on("error", (error) => {
      this.logger.error("Redis workflow subscriber error", error);
    });
    this.subscriber.on("message", (topic, payload) => {
      void this.dispatchRemote(topic, payload);
    });
  }

  async publish(topic: string, event: WorkflowEvent<TOutput>): Promise<void> {
    this.assertOpen();
    const payload = stringifyJson(event, topic);
    const deliveryKey = `${topic}:${event.id}`;
    this.localDeliveries.add(deliveryKey);
    try {
      await this.redis.publish(topic, payload);
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
    this.assertOpen();
    const callbacks = this.callbacks.get(topic) ?? new Set();
    callbacks.add(callback);
    this.callbacks.set(topic, callbacks);
    if (callbacks.size === 1) {
      void this.subscriber.subscribe(topic).catch((error: unknown) => {
        this.logger.error("Redis workflow subscription failed", toError(error), {
          topic,
        });
      });
    }
    return () => {
      const current = this.callbacks.get(topic);
      if (!current) return;
      current.delete(callback);
      if (current.size > 0) return;
      this.callbacks.delete(topic);
      void this.subscriber.unsubscribe(topic).catch((error: unknown) => {
        this.logger.warn("Redis workflow unsubscribe failed", {
          topic,
          error: toError(error).message,
        });
      });
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.callbacks.clear();
    this.localDeliveries.clear();
    try {
      await this.subscriber.quit();
    } catch {
      this.subscriber.disconnect();
    }
  }

  private async dispatchRemote(topic: string, payload: string): Promise<void> {
    let event: WorkflowEvent<TOutput>;
    try {
      event = parseJson<WorkflowEvent<TOutput>>(payload, topic);
    } catch (error) {
      this.logger.warn("Ignoring malformed Redis workflow event", {
        topic,
        error: toError(error).message,
      });
      return;
    }
    if (this.localDeliveries.delete(`${topic}:${event.id}`)) return;
    await this.dispatch(topic, event);
  }

  private async dispatch(topic: string, event: WorkflowEvent<TOutput>): Promise<void> {
    const callbacks = [...(this.callbacks.get(topic) ?? [])];
    await Promise.allSettled(
      callbacks.map((callback) => callback(structuredClone(event))),
    );
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Redis workflow pub/sub is closed");
  }
}

/** Redis-backed idempotency claims for event gateways and triggers. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly redis: RedisCommandClient,
    private readonly keyPrefix = "wf:idempotency:",
  ) {}

  async claim(
    key: string,
    reference: WorkflowRunReference,
    expiresAt?: number,
    fingerprint?: string,
  ): Promise<IdempotencyClaim> {
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      throw new RangeError("Idempotency expiration must be in the future");
    }
    const entry = { reference, expiresAt, fingerprint };
    const args: Array<string | number> = ["NX"];
    if (expiresAt !== undefined) args.push("PX", expiresAt - Date.now());
    const result = await this.redis.set(
      this.key(key),
      stringifyJson(entry, key),
      ...args,
    );
    if (result === "OK") {
      return { claimed: true, reference: structuredClone(reference) };
    }
    const existing = await this.redis.get(this.key(key));
    if (existing === null) return this.claim(key, reference, expiresAt, fingerprint);
    const parsed = parseJson<{
      reference: WorkflowRunReference;
      fingerprint?: string;
    }>(existing, key);
    return {
      claimed: false,
      reference: structuredClone(parsed.reference),
      ...(fingerprint !== undefined &&
      parsed.fingerprint !== undefined &&
      parsed.fingerprint !== fingerprint
        ? { conflict: true }
        : {}),
    };
  }

  async release(key: string, reference: WorkflowRunReference): Promise<boolean> {
    const result = await this.redis.eval<number>(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.reference.workflowId ~= ARGV[1] or current.reference.runId ~= ARGV[2] then return 0 end
redis.call("DEL", KEYS[1])
return 1
`,
      1,
      this.key(key),
      reference.workflowId,
      reference.runId,
    );
    return result === 1;
  }

  async clearExpired(): Promise<number> {
    // Redis expires TTL keys automatically. This method is intentionally a
    // no-op and is safe to call from the gateway cleanup path.
    return 0;
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

export interface RedisWorkflowAdaptersOptions<TContext, TInput, TOutput> {
  client: RedisPubSubClient;
  stepsFactory: () => Workflow<TContext, TInput, TOutput>["steps"];
  workflowKeyPrefix?: string;
  eventKeyPrefix?: string;
  lockKeyPrefix?: string;
  eventTopicPrefix?: string;
  idempotencyKeyPrefix?: string;
  holderId?: string;
  logger?: RedisAdapterLogger;
}

export interface RedisWorkflowAdapters<TContext, TInput, TOutput> {
  readonly keyValueStore: RedisJsonKeyValueStore;
  readonly lockStore: RedisWorkflowLockStore;
  readonly workflowStore: JsonWorkflowStore<TContext, TInput, TOutput>;
  readonly eventStore: JsonEventStore<TOutput>;
  readonly pubSub: RedisPubSubAdapter<TOutput>;
  readonly eventBus: EventBus<TOutput>;
  readonly idempotencyStore: RedisIdempotencyStore;
  close(): Promise<void>;
}

/** Compose the standard Redis-backed adapters required by WorkflowEngine. */
export function createRedisWorkflowAdapters<TContext, TInput, TOutput>(
  options: RedisWorkflowAdaptersOptions<TContext, TInput, TOutput>,
): RedisWorkflowAdapters<TContext, TInput, TOutput> {
  const keyValueStore = new RedisJsonKeyValueStore(options.client);
  const lockStore = new RedisWorkflowLockStore(
    options.client,
    options.lockKeyPrefix,
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
  const pubSub = new RedisPubSubAdapter<TOutput>(options.client, options.logger);
  const eventBus = new AdapterEventBus<TOutput>(pubSub, options.eventTopicPrefix);
  const idempotencyStore = new RedisIdempotencyStore(
    options.client,
    options.idempotencyKeyPrefix,
  );
  return {
    keyValueStore,
    lockStore,
    workflowStore,
    eventStore,
    pubSub,
    eventBus,
    idempotencyStore,
    close: () => pubSub.close(),
  };
}

function stringifyJson(value: unknown, key: string): string {
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError(`Value for ${key} is not JSON serializable`);
  return result;
}

function escapeRedisPattern(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&");
}

function parseJson<T>(value: string, key: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid JSON stored at ${key}`, { cause: error });
  }
}

function assertVersion(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
