export interface RateLimitRequest {
  key: string;
  cost?: number | undefined;
  now?: number | undefined;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimitExceededError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Workflow rate limit exceeded; retry after ${retryAfterMs}ms`);
    this.name = "RateLimitExceededError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Atomic backend primitive for distributed token-bucket rate limiting. */
export interface TokenBucketStore {
  take(
    key: string,
    capacity: number,
    refillPerSecond: number,
    cost: number,
    now: number,
  ): Promise<RateLimitDecision>;
}

export interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  keyPrefix?: string | undefined;
}

export interface TenantPolicy {
  tenantId: string;
  enabled?: boolean | undefined;
  maxConcurrentWorkflows?: number | undefined;
  maxConcurrentActivities?: number | undefined;
  rateLimit?:
    | {
        capacity: number;
        refillPerSecond: number;
      }
    | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface TenantPolicyStore {
  get(tenantId: string): Promise<TenantPolicy | null>;
  set(policy: TenantPolicy): Promise<void>;
  delete(tenantId: string): Promise<void>;
}

export interface TenantConcurrencyLease {
  tenantId: string;
  leaseId: string;
  expiresAt?: number | undefined;
}

/** Atomic admission primitive for per-tenant workflow/activity concurrency limits. */
export interface TenantConcurrencyStore {
  acquire(
    tenantId: string,
    limit: number,
    leaseId: string,
    expiresAt?: number | undefined,
  ): Promise<boolean>;
  renew(
    tenantId: string,
    leaseId: string,
    expiresAt?: number | undefined,
  ): Promise<boolean>;
  release(tenantId: string, leaseId: string): Promise<boolean>;
  reclaimExpired(now?: number): Promise<number>;
}
