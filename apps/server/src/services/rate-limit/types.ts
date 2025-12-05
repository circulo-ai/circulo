import { env } from "@/lib/env";

export type RateLimitBucket = "api" | "sync" | "async";
export type RateLimitPlan = "free" | "pro" | "team" | "enterprise";

export type RateLimitPlanConfig = {
  api: number;
  sync: number;
  async: number;
  windowMs: number;
};

export type RateLimitRequest = {
  key: string;
  bucket: RateLimitBucket;
  limit?: number;
  windowMs?: number;
  plan?: RateLimitPlan;
};

export type RateLimitState = {
  count: number;
  resetAt: Date;
};

export type RateLimitDecision = RateLimitState & {
  allowed: boolean;
  remaining: number;
  limit: number;
  key: string;
  plan: RateLimitPlan;
  bucket: RateLimitBucket;
};

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const RATE_LIMIT_WINDOW_MS = parseNumber(env.RATE_LIMIT_WINDOW_MS, 60_000);

const API_ENDPOINT_LIMITS: Record<RateLimitPlan, number> = {
  free: 60,
  pro: 120,
  team: 240,
  enterprise: 480,
};

export const RATE_LIMITS: Record<RateLimitPlan, RateLimitPlanConfig> = {
  free: {
    api: API_ENDPOINT_LIMITS.free,
    sync: parseNumber(env.RATE_LIMIT_FREE_SYNC, 60),
    async: parseNumber(env.RATE_LIMIT_FREE_ASYNC, 50),
    windowMs: RATE_LIMIT_WINDOW_MS,
  },
  pro: {
    api: API_ENDPOINT_LIMITS.pro,
    sync: parseNumber(env.RATE_LIMIT_PRO_SYNC, 120),
    async: parseNumber(env.RATE_LIMIT_PRO_ASYNC, 200),
    windowMs: RATE_LIMIT_WINDOW_MS,
  },
  team: {
    api: API_ENDPOINT_LIMITS.team,
    sync: parseNumber(env.RATE_LIMIT_TEAM_SYNC, 240),
    async: parseNumber(env.RATE_LIMIT_TEAM_ASYNC, 500),
    windowMs: RATE_LIMIT_WINDOW_MS,
  },
  enterprise: {
    api: API_ENDPOINT_LIMITS.enterprise,
    sync: parseNumber(env.RATE_LIMIT_ENTERPRISE_SYNC, 480),
    async: parseNumber(env.RATE_LIMIT_ENTERPRISE_ASYNC, 1000),
    windowMs: RATE_LIMIT_WINDOW_MS,
  },
};

export const DEFAULT_PLAN: RateLimitPlan = "free";
