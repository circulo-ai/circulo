# @circulo-ai/redis

Framework-agnostic Redis client utilities with connection reuse, namespacing, JSON helpers, and simple distributed locks. Built on [`ioredis`](https://github.com/redis/ioredis) with production-safe defaults.

## Install

```bash
bun add @circulo-ai/redis ioredis
```

## Quickstart

```ts
import { createRedis } from "@circulo-ai/redis";

const redis = createRedis({ namespace: "app" }); // uses REDIS_URL by default

await redis.set("key", "value", { ex: 60 });
const val = await redis.get("key"); // "value"

await redis.setJson("user:1", { name: "Ada" }, { ex: 300 });
const user = await redis.getJson<{ name: string }>("user:1");

// Simple lock with retry
await redis.withLock(
  "job:123",
  async () => {
    // do work
  },
  { ttlSeconds: 30, maxAttempts: 5, backoffMs: 100 },
);
```

## API

- `createRedis(config?)` → `CirculoRedis`
  - `url`: connection string (defaults to `process.env.REDIS_URL`)
  - `namespace`: optional prefix applied to all keys
  - `reuse` (default `true`): reuse a shared global client to avoid connection storms
  - `options`: extra `ioredis` options merged onto production-friendly defaults
  - `logger(level, message, meta?)`: optional lifecycle logger
- `CirculoRedis` methods
  - `get`, `set`, `getJson`, `setJson`, `del`, `exists`, `expire`, `ttl`, `incrBy`, `decrBy`
  - `ping`, `healthCheck()`
  - `acquireLock`, `releaseLock`, `withLock`
  - `withNamespace(ns)` to derive a namespaced view on the same connection
  - `close(force?: boolean)`; for shared clients, pass `force: true`
- `closeSharedRedis()` to explicitly tear down the shared global client.

## Production defaults

- Single shared client by default (`reuse: true`) to keep connection count low.
- Ready check, limited retries, keep-alive, and short connect timeout.
- Optional event logging hooks (`connect`, `ready`, `reconnecting`, `error`, `end`).

## Notes

- This package is framework-agnostic; no HTTP/middleware assumptions.
- If you need multiple logical tenants, prefer `namespace`/`withNamespace` over new connections.
