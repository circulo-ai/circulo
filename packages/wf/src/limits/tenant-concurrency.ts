import { generateId } from "../utils/id";
import type { TenantConcurrencyLease, TenantConcurrencyStore } from "../models";

export class TenantConcurrencyGate {
  constructor(private readonly store: TenantConcurrencyStore) {}

  async acquire(
    tenantId: string,
    limit: number,
    options: { leaseId?: string | undefined; expiresAt?: number | undefined } = {},
  ): Promise<TenantConcurrencyLease | null> {
    if (!tenantId.trim()) throw new Error("Tenant id must not be empty");
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Tenant concurrency limit must be positive");
    const lease: TenantConcurrencyLease = {
      tenantId,
      leaseId: options.leaseId ?? generateId("tenant-lease"),
      ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    };
    const acquired = await this.store.acquire(tenantId, limit, lease.leaseId, lease.expiresAt);
    return acquired ? lease : null;
  }

  release(lease: TenantConcurrencyLease): Promise<boolean> {
    return this.store.release(lease.tenantId, lease.leaseId);
  }

  async renew(lease: TenantConcurrencyLease, expiresAt?: number): Promise<boolean> {
    const renewed = await this.store.renew(lease.tenantId, lease.leaseId, expiresAt);
    if (renewed && expiresAt !== undefined) lease.expiresAt = expiresAt;
    return renewed;
  }
}

interface ActiveLease {
  leaseId: string;
  expiresAt?: number | undefined;
}

/** Reference in-memory implementation; distributed stores must make acquire atomic. */
export class InMemoryTenantConcurrencyStore implements TenantConcurrencyStore {
  private readonly leases = new Map<string, Map<string, ActiveLease>>();

  async acquire(tenantId: string, limit: number, leaseId: string, expiresAt?: number): Promise<boolean> {
    await this.reclaimExpired();
    const leases = this.leases.get(tenantId) ?? new Map<string, ActiveLease>();
    if (leases.size >= limit) return false;
    leases.set(leaseId, { leaseId, ...(expiresAt === undefined ? {} : { expiresAt }) });
    this.leases.set(tenantId, leases);
    return true;
  }

  async release(tenantId: string, leaseId: string): Promise<boolean> {
    const leases = this.leases.get(tenantId);
    if (!leases) return false;
    const released = leases.delete(leaseId);
    if (leases.size === 0) this.leases.delete(tenantId);
    return released;
  }

  async renew(tenantId: string, leaseId: string, expiresAt?: number): Promise<boolean> {
    await this.reclaimExpired();
    const lease = this.leases.get(tenantId)?.get(leaseId);
    if (!lease) return false;
    lease.expiresAt = expiresAt;
    return true;
  }

  async reclaimExpired(now = Date.now()): Promise<number> {
    let reclaimed = 0;
    for (const [tenantId, leases] of this.leases) {
      for (const [leaseId, lease] of leases) {
        if (lease.expiresAt !== undefined && lease.expiresAt <= now) {
          leases.delete(leaseId);
          reclaimed += 1;
        }
      }
      if (leases.size === 0) this.leases.delete(tenantId);
    }
    return reclaimed;
  }
}
