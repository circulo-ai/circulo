import { describe, expect, it } from "vitest";
import {
  InMemoryTenantConcurrencyStore,
  InMemoryTenantPolicyStore,
  InMemoryTokenBucketStore,
  TenantConcurrencyGate,
  TokenBucketRateLimiter,
} from "../src";

describe("rate limiting and tenant policies", () => {
  it("enforces a keyed token bucket and reports retry delay", async () => {
    const limiter = new TokenBucketRateLimiter(new InMemoryTokenBucketStore(), {
      capacity: 2,
      refillPerSecond: 1,
    });
    expect((await limiter.take({ key: "tenant-a", now: 0 })).allowed).toBe(
      true,
    );
    expect((await limiter.take({ key: "tenant-a", now: 0 })).allowed).toBe(
      true,
    );
    const blocked = await limiter.take({ key: "tenant-a", now: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect((await limiter.take({ key: "tenant-b", now: 0 })).allowed).toBe(
      true,
    );
    expect((await limiter.take({ key: "tenant-a", now: 1000 })).allowed).toBe(
      true,
    );
  });

  it("stores isolated tenant policies", async () => {
    const policies = new InMemoryTenantPolicyStore();
    await policies.set({
      tenantId: "tenant-a",
      maxConcurrentWorkflows: 10,
      rateLimit: { capacity: 20, refillPerSecond: 5 },
    });
    expect(await policies.get("tenant-a")).toMatchObject({
      tenantId: "tenant-a",
      maxConcurrentWorkflows: 10,
    });
    await policies.delete("tenant-a");
    expect(await policies.get("tenant-a")).toBeNull();
    await expect(
      policies.set({ tenantId: "tenant-b", maxConcurrentWorkflows: 0 }),
    ).rejects.toThrow("positive");
  });

  it("admits tenant work up to the configured concurrency and recovers expired leases", async () => {
    const gate = new TenantConcurrencyGate(
      new InMemoryTenantConcurrencyStore(),
    );
    const first = await gate.acquire("tenant-a", 1, {
      expiresAt: Date.now() + 1000,
    });
    expect(first).not.toBeNull();
    await expect(gate.acquire("tenant-a", 1)).resolves.toBeNull();
    expect(await gate.release(first!)).toBe(true);
    await expect(gate.acquire("tenant-a", 1)).resolves.not.toBeNull();
  });
});
