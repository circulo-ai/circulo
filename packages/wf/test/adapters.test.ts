import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AdapterEventBus,
  PostgresJsonKeyValueStore,
  RedisJsonKeyValueStore,
  RedisPubSubAdapter,
  RedisTaskQueue,
  RedisWorkflowHistoryStore,
  RedisWorkflowLockStore,
  createPostgresJsQueryClient,
  type PostgresQueryClient,
  type RedisPubSubClient,
  type WorkflowEvent,
} from "../src";

class FakeRedis implements RedisPubSubClient {
  readonly values = new Map<string, string>();
  readonly subscribers = new Map<string, Set<(message: string) => void>>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    ...arguments_: Array<string | number>
  ): Promise<unknown> {
    if (arguments_.includes("NX") && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    return keys.reduce((deleted, key) => deleted + Number(this.values.delete(key)), 0);
  }

  async scan(
    cursor: string,
    ...arguments_: Array<string | number>
  ): Promise<[string, string[]]> {
    if (cursor !== "0") return ["0", []];
    const match = String(arguments_[1] ?? "*").replace("*", "");
    return ["0", [...this.values.keys()].filter((key) => key.startsWith(match))];
  }

  async eval<T>(script: string, _numberOfKeys: number, ...arguments_: string[]): Promise<T> {
    const key = arguments_[0]!;
    const raw = this.values.get(key);
    if (script.includes("current.version")) {
      if (!raw) return 0 as T;
      const current = JSON.parse(raw) as { version?: number };
      if (current.version !== Number(arguments_[1])) return 0 as T;
      this.values.set(key, arguments_[2]!);
      return 1 as T;
    }
    if (script.includes("current.reference")) {
      if (!raw) return 0 as T;
      const current = JSON.parse(raw) as { reference: { workflowId: string; runId: string } };
      if (current.reference.workflowId !== arguments_[1] || current.reference.runId !== arguments_[2]) return 0 as T;
      this.values.delete(key);
      return 1 as T;
    }
    if (!raw) return 0 as T;
    const current = JSON.parse(raw) as { id: string; holder: string; expiresAt: number };
    if (current.id !== arguments_[1] || current.holder !== arguments_[2]) return 0 as T;
    if (script.includes("DEL")) {
      this.values.delete(key);
      return 1 as T;
    }
    current.expiresAt = Number(arguments_[3]);
    this.values.set(key, JSON.stringify(current));
    return 1 as T;
  }

  async publish(channel: string, message: string): Promise<number> {
    for (const callback of this.subscribers.get(channel) ?? []) callback(message);
    return this.subscribers.get(channel)?.size ?? 0;
  }

  duplicate(): RedisPubSubClient {
    return this;
  }

  async subscribe(channel: string): Promise<number> {
    if (!this.subscribers.has(channel)) this.subscribers.set(channel, new Set());
    return this.subscribers.get(channel)!.size;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.subscribers.delete(channel);
    return 0;
  }

  on(
    _event: "message" | "error",
    _listener: ((channel: string, message: string) => void) | ((error: Error) => void),
  ): this {
    return this;
  }

  async quit(): Promise<unknown> {
    return "OK";
  }

  disconnect(): void {}
}

class FakePostgres implements PostgresQueryClient {
  readonly values = new Map<string, { value: unknown; version: number }>();

  async query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    parameters: readonly unknown[] = [],
  ): Promise<{ rows: readonly TRow[]; rowCount: number }> {
    if (text.includes("SELECT value FROM")) {
      const value = this.values.get(String(parameters[0]))?.value;
      return {
        rows: value === undefined ? [] : [{ value } as unknown as TRow],
        rowCount: value === undefined ? 0 : 1,
      };
    }
    if (text.includes("INSERT INTO") && text.includes("wf_json_values")) {
      this.values.set(String(parameters[0]), {
        value: JSON.parse(String(parameters[1])),
        version: Number(parameters[2]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE") && text.includes("wf_json_values")) {
      const current = this.values.get(String(parameters[0]));
      if (!current || current.version !== Number(parameters[3])) return { rows: [], rowCount: 0 };
      this.values.set(String(parameters[0]), {
        value: JSON.parse(String(parameters[1])),
        version: Number(parameters[2]),
      });
      return { rows: [{ key: parameters[0] } as unknown as TRow], rowCount: 1 };
    }
    if (text.includes("SELECT key, value FROM")) {
      const prefix = String(parameters[0]);
      const rows = [...this.values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, entry]) => ({ key, value: entry.value }) as unknown as TRow);
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }
}

function event(id: string): WorkflowEvent<string> {
  return {
    id,
    workflowId: "workflow-1",
    timestamp: 1,
    eventType: "workflow.completed",
    payload: { type: "completed", output: "ok", duration: 1 },
  };
}

describe("Redis reusable adapters", () => {
  it("provides durable replay history and delayed task implementations", async () => {
    const redis = new FakeRedis();
    const history = new RedisWorkflowHistoryStore(redis);
    await history.append(
      {
        workflowId: "workflow-1",
        runId: "run-1",
        eventId: "started",
        eventType: "workflow.started",
        payload: { workflowVersion: 1 },
      },
      0,
    );
    expect(await history.nextSequence("workflow-1", "run-1")).toBe(1);

    const queue = new RedisTaskQueue(redis);
    await queue.enqueue({
      id: "timer-1",
      kind: "timer",
      queue: "timer",
      workflowId: "workflow-1",
      runId: "run-1",
      payload: { timerId: "timer-1", fireAt: 1000 },
      attempt: 0,
      maxAttempts: 1,
      priority: 0,
      createdAt: 1,
      availableAt: 1000,
    });
    expect(
      await queue.claim({
        queue: "timer",
        workerId: "timer-worker",
        leaseDurationMs: 1000,
        now: 1000,
      }),
    ).not.toBeNull();
  });

  it("uses atomic CAS and SCAN-backed listing", async () => {
    const redis = new FakeRedis();
    const store = new RedisJsonKeyValueStore(redis);
    await store.set("wf:one", { version: 0, value: "a" });
    expect(await store.compareAndSet("wf:one", 1, { version: 2 })).toBe(false);
    expect(await store.compareAndSet("wf:one", 0, { version: 1, value: "b" })).toBe(true);
    expect(await store.list<{ version: number; value: string }>("wf:")).toEqual([
      { key: "wf:one", value: { version: 1, value: "b" } },
    ]);
  });

  it("enforces lock ownership and renews leases", async () => {
    const redis = new FakeRedis();
    const locks = new RedisWorkflowLockStore(redis, "lock:", "worker-1");
    const first = await locks.acquireLock("workflow-1", 1000);
    expect(first).not.toBeNull();
    expect(await locks.acquireLock("workflow-1", 1000, "worker-2")).toBeNull();
    expect(await locks.renewLock({ ...first!, holder: "worker-2" }, 1000)).toBe(false);
    expect(await locks.renewLock(first!, 2000)).toBe(true);
    await locks.releaseLock(first!);
    expect(await locks.acquireLock("workflow-1", 1000)).not.toBeNull();
  });

  it("bridges Redis pub/sub through the standard EventBus contract", async () => {
    const redis = new FakeRedis();
    const transport = new RedisPubSubAdapter<string>(redis);
    const bus = new AdapterEventBus<string>(transport);
    const received: string[] = [];
    bus.subscribe("workflow-1", (receivedEvent) => {
      received.push(receivedEvent.id);
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await bus.publish(event("event-1"));
    expect(received).toEqual(["event-1"]);
    await transport.close();
  });
});

describe("PostgreSQL reusable adapters", () => {
  it("persists JSON values with optimistic version checks", async () => {
    const client = new FakePostgres();
    const store = new PostgresJsonKeyValueStore(client);
    await store.initialize();
    await store.set("wf:one", { version: 0, state: "pending" });
    expect(await store.compareAndSet("wf:one", 0, { version: 1, state: "done" })).toBe(true);
    expect(await store.get<{ version: number; state: string }>("wf:one")).toEqual({
      version: 1,
      state: "done",
    });
    expect(() => new PostgresJsonKeyValueStore(client, "wf_values; DROP TABLE users")).toThrow(
      "Invalid PostgreSQL identifier",
    );
  });

  it("adapts a postgres.js unsafe client without adding a runtime dependency", async () => {
    const queries: string[] = [];
    const queryClient = createPostgresJsQueryClient({
      async unsafe<TRow extends Record<string, unknown>>(
        text: string,
      ): Promise<readonly TRow[]> {
        queries.push(text);
        return [];
      },
    });
    await queryClient.query("SELECT 1", ["value"]);
    expect(queries).toEqual(["SELECT 1"]);
  });

  it("keeps the adapter contracts strongly typed", () => {
    expectTypeOf<PostgresQueryClient["query"]>().toBeFunction();
    expectTypeOf<RedisPubSubClient["publish"]>().returns.resolves.toEqualTypeOf<number>();
  });
});
