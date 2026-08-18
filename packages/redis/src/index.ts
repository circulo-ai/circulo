import Redis, { type RedisOptions } from "ioredis";

export type LogLevel = "info" | "warn" | "error";
export type RedisLogger = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) => void;

export type RedisConfig = {
  /**
   * Redis connection string. Falls back to process.env.REDIS_URL.
   */
  url?: string;
  /**
   * Optional namespace added as a prefix to all keys (`${namespace}:${key}`).
   */
  namespace?: string;
  /**
   * Reuse a shared global Redis connection. If false, a new client is created.
   * Defaults to true to avoid connection storms.
   */
  reuse?: boolean;
  /**
   * Additional ioredis options to merge onto sensible defaults.
   */
  options?: RedisOptions;
  /**
   * Optional logger for connection lifecycle events and warnings.
   */
  logger?: RedisLogger;
};

export type SetOptions = {
  ex?: number; // seconds
  px?: number; // milliseconds
  nx?: boolean;
  xx?: boolean;
  keepTtl?: boolean;
};

export type LockOptions = {
  ttlSeconds: number;
  maxAttempts?: number;
  backoffMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_OPTIONS: Partial<RedisOptions> = {
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  connectTimeout: 5_000,
  keepAlive: 1_000,
  lazyConnect: true,
  autoResendUnfulfilledCommands: true,
  autoResubscribe: true,
};

const GLOBAL_KEY = Symbol.for("circulo.redis.singleton");
type GlobalRedis = { client: Redis; url: string };

function getGlobal(): GlobalRedis | undefined {
  const store = globalThis as unknown as Record<string | symbol, unknown>;
  return store[GLOBAL_KEY] as GlobalRedis | undefined;
}

function setGlobal(value: GlobalRedis | undefined): void {
  const store = globalThis as unknown as Record<string | symbol, unknown>;
  store[GLOBAL_KEY] = value;
}

function randomId(): string {
  // Prefer crypto.randomUUID where available
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function attachLogging(client: Redis, logger?: RedisLogger) {
  if (!logger) return;
  client.on("connect", () => logger("info", "Redis connect"));
  client.on("ready", () => logger("info", "Redis ready"));
  client.on("reconnecting", (delay: number) =>
    logger("warn", "Redis reconnecting", { delay }),
  );
  client.on("error", (err: Error) => logger("error", "Redis error", { err }));
  client.on("end", () => logger("warn", "Redis connection closed"));
}

export class CirculoRedis {
  constructor(
    readonly raw: Redis,
    private readonly namespace?: string,
    private readonly logger?: RedisLogger,
    private readonly shared = true,
  ) {}

  withNamespace(namespace: string): CirculoRedis {
    return new CirculoRedis(this.raw, namespace, this.logger, this.shared);
  }

  private key(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  async ping(message?: string): Promise<string> {
    return message === undefined ? this.raw.ping() : this.raw.ping(message);
  }

  async get(key: string): Promise<string | null> {
    return this.raw.get(this.key(key));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger?.("warn", "Failed to parse JSON value", { key, error });
      return null;
    }
  }

  async set(
    key: string,
    value: string | Buffer | number,
    options?: SetOptions,
  ): Promise<boolean> {
    const args: (string | number | Buffer)[] = [this.key(key), value];
    if (options?.ex !== undefined) args.push("EX", options.ex);
    if (options?.px !== undefined) args.push("PX", options.px);
    if (options?.nx) args.push("NX");
    if (options?.xx) args.push("XX");
    if (options?.keepTtl) args.push("KEEPTTL");

    const result = (await this.raw.set(
      ...(args as Parameters<Redis["set"]>),
    )) as string | null;
    return result === "OK";
  }

  async setJson<T>(
    key: string,
    value: T,
    options?: SetOptions,
  ): Promise<boolean> {
    return this.set(key, JSON.stringify(value), options);
  }

  async del(...keys: string[]): Promise<number> {
    if (!keys.length) return 0;
    return this.raw.del(...keys.map((k) => this.key(k)));
  }

  async exists(...keys: string[]): Promise<number> {
    if (!keys.length) return 0;
    return this.raw.exists(...keys.map((k) => this.key(k)));
  }

  async incrBy(key: string, amount = 1): Promise<number> {
    return this.raw.incrby(this.key(key), amount);
  }

  async atomicIncrementWithExpiry(
    key: string,
    amount: number,
    ttlMs: number,
  ): Promise<{ count: number; ttlMs: number }> {
    const script = [
      "local count = redis.call('INCRBY', KEYS[1], ARGV[1])",
      "if count == tonumber(ARGV[1]) then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end",
      "return { count, redis.call('PTTL', KEYS[1]) }",
    ].join(" ");
    const result = (await this.raw.eval(
      script,
      1,
      this.key(key),
      amount,
      ttlMs,
    )) as [number, number];
    return { count: Number(result[0]), ttlMs: Number(result[1]) };
  }

  async decrBy(key: string, amount = 1): Promise<number> {
    return this.raw.decrby(this.key(key), amount);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return (await this.raw.expire(this.key(key), seconds)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.raw.ttl(this.key(key));
  }

  async acquireLock(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.raw.set(
      this.key(key),
      value,
      "EX",
      ttlSeconds,
      "NX",
    );
    return result === "OK";
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    const result = await this.raw.eval(script, 1, this.key(key), value);
    return result === 1;
  }

  async withLock<T>(
    key: string,
    run: () => Promise<T>,
    options: LockOptions,
  ): Promise<T> {
    const lockValue = randomId();
    const maxAttempts = options.maxAttempts ?? 1;
    const backoffMs = options.backoffMs ?? 50;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;
      if (options.signal?.aborted) {
        throw new Error("Lock acquisition aborted");
      }
      const acquired = await this.acquireLock(
        key,
        lockValue,
        options.ttlSeconds,
      );
      if (acquired) {
        try {
          return await run();
        } finally {
          await this.releaseLock(key, lockValue);
        }
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error("Failed to acquire lock");
  }

  async healthCheck(timeoutMs = 2000): Promise<boolean> {
    const timer = setTimeout(() => this.raw.disconnect(), timeoutMs);
    try {
      await this.ping();
      return true;
    } catch (error) {
      this.logger?.("warn", "Redis health check failed", { error });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Close the underlying connection. For shared clients, use force=true to quit.
   */
  async close(force = false): Promise<void> {
    if (this.shared && !force) return;
    try {
      await this.raw.quit();
    } catch {
      await this.raw.disconnect();
    }
  }
}

export function createRedis(config: RedisConfig = {}): CirculoRedis {
  const reuse = config.reuse ?? true;
  const url = config.url ?? process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing Redis URL. Provide config.url or set REDIS_URL.");
  }

  const mergedOptions: RedisOptions = {
    ...DEFAULT_OPTIONS,
    ...config.options,
  };

  let client: Redis;
  if (reuse) {
    const existing = getGlobal();
    if (existing) {
      if (existing.url !== url) {
        config.logger?.("warn", "Existing Redis client uses a different URL", {
          existingUrl: existing.url,
          requestedUrl: url,
        });
      }
      client = existing.client;
    } else {
      client = new Redis(url, mergedOptions);
      attachLogging(client, config.logger);
      setGlobal({ client, url });
    }
  } else {
    client = new Redis(url, mergedOptions);
    attachLogging(client, config.logger);
  }

  return new CirculoRedis(client, config.namespace, config.logger, reuse);
}

export async function closeSharedRedis(): Promise<void> {
  const existing = getGlobal();
  if (!existing) return;
  try {
    await existing.client.quit();
  } finally {
    setGlobal(undefined);
  }
}
