import type { TenantPolicy, TenantPolicyStore } from "../models";

export class InMemoryTenantPolicyStore implements TenantPolicyStore {
  private readonly policies = new Map<string, TenantPolicy>();

  async get(tenantId: string): Promise<TenantPolicy | null> {
    const policy = this.policies.get(tenantId);
    return policy ? structuredClone(policy) : null;
  }

  async set(policy: TenantPolicy): Promise<void> {
    if (!policy.tenantId.trim()) throw new Error("Tenant id must not be empty");
    if (policy.enabled === false) {
      this.policies.set(policy.tenantId, structuredClone(policy));
      return;
    }
    validateOptionalLimit(policy.maxConcurrentWorkflows, "maxConcurrentWorkflows");
    validateOptionalLimit(policy.maxConcurrentActivities, "maxConcurrentActivities");
    if (policy.rateLimit) {
      validateOptionalLimit(policy.rateLimit.capacity, "rateLimit.capacity");
      validateOptionalLimit(policy.rateLimit.refillPerSecond, "rateLimit.refillPerSecond");
    }
    this.policies.set(policy.tenantId, structuredClone(policy));
  }

  async delete(tenantId: string): Promise<void> {
    this.policies.delete(tenantId);
  }
}

function validateOptionalLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new RangeError(`${name} must be positive`);
  }
}
