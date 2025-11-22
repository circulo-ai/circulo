import { db } from "@/db";
import { userRateLimits } from "@/db/schema";
import { checkServerSideUsageLimits } from "@/lib/billing/calculations/usage-monitor";
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";
import { isBillingEnabled } from "@/lib/environment";
import { createLogger } from "@/lib/logs/console/logger";
import { eq, sql } from "drizzle-orm";
import {
  getChatBillingContext,
  getOrganizationBillingContext,
} from "./billing-context";

const logger = createLogger("BillingLimits");

// ==================== TYPES ====================

export interface ExecutionCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
  limit?: number;
}

export interface FeatureCheckResult {
  allowed: boolean;
  requiredPlan?: string;
  currentPlan: string;
  reason?: string;
}

// ==================== RATE LIMITS CONFIG ====================

const RATE_LIMITS = {
  free: {
    syncApi: 60, // per minute
    asyncApi: 10,
    apiEndpoint: 100,
    windowMs: 60000, // 1 minute
  },
  pro: {
    syncApi: 300,
    asyncApi: 50,
    apiEndpoint: 500,
    windowMs: 60000,
  },
  team: {
    syncApi: 1000,
    asyncApi: 200,
    apiEndpoint: 2000,
    windowMs: 60000,
  },
  enterprise: {
    syncApi: 5000,
    asyncApi: 1000,
    apiEndpoint: 10000,
    windowMs: 60000,
  },
} as const;

type RateLimitPlan = keyof typeof RATE_LIMITS;
type RateLimitType = "syncApi" | "asyncApi" | "apiEndpoint";

// ==================== USAGE LIMIT CHECKS ====================

/**
 * Check if user can execute in a specific chat
 * Primary check before any billable chat operation
 */
export async function canExecuteInChat(
  chatId: string,
  userId: string,
): Promise<ExecutionCheckResult> {
  if (!isBillingEnabled) {
    return { allowed: true };
  }

  try {
    const billing = await getChatBillingContext(chatId);

    // Use the existing server-side check which handles:
    // - Individual limits for free/pro
    // - Pooled org limits for team/enterprise
    // - billingBlocked flag
    const limits = await checkServerSideUsageLimits(userId);

    if (limits.isExceeded) {
      const message = billing.isPooled
        ? "Organization usage limit exceeded. Contact your admin to increase the limit or upgrade your plan."
        : limits.message || "Usage limit exceeded. Please upgrade your plan.";

      logger.info("Execution blocked due to usage limits", {
        chatId,
        userId,
        isPooled: billing.isPooled,
        currentUsage: limits.currentUsage,
        limit: limits.limit,
      });

      return {
        allowed: false,
        reason: message,
        currentUsage: limits.currentUsage,
        limit: limits.limit,
      };
    }

    return {
      allowed: true,
      currentUsage: limits.currentUsage,
      limit: limits.limit,
    };
  } catch (error) {
    logger.error("Error checking execution permission", {
      chatId,
      userId,
      error,
    });

    // Fail closed - block if we can't verify
    return {
      allowed: false,
      reason: "Unable to verify usage limits. Please try again.",
    };
  }
}

/**
 * Check if user can execute in an organization context
 */
export async function canExecuteInOrganization(
  organizationId: string,
  userId: string,
): Promise<ExecutionCheckResult> {
  if (!isBillingEnabled) {
    return { allowed: true };
  }

  try {
    const billing = await getOrganizationBillingContext(organizationId);
    const limits = await checkServerSideUsageLimits(userId);

    if (limits.isExceeded) {
      return {
        allowed: false,
        reason: billing.isPooled
          ? "Organization usage limit exceeded."
          : limits.message || "Usage limit exceeded.",
        currentUsage: limits.currentUsage,
        limit: limits.limit,
      };
    }

    return {
      allowed: true,
      currentUsage: limits.currentUsage,
      limit: limits.limit,
    };
  } catch (error) {
    logger.error("Error checking org execution permission", {
      organizationId,
      userId,
      error,
    });
    return {
      allowed: false,
      reason: "Unable to verify usage limits.",
    };
  }
}

// ==================== RATE LIMIT CHECKS ====================

/**
 * Check and update rate limits
 * Returns whether the request is allowed and updates counters
 */
export async function checkRateLimit(
  referenceId: string,
  requestType: RateLimitType,
  plan: string,
): Promise<RateLimitResult> {
  if (!isBillingEnabled) {
    return { allowed: true };
  }

  const limits = RATE_LIMITS[plan as RateLimitPlan] || RATE_LIMITS.free;
  const now = new Date();

  try {
    // Get or create rate limit record
    const records = await db
      .select()
      .from(userRateLimits)
      .where(eq(userRateLimits.referenceId, referenceId))
      .limit(1);

    const limitForType = limits[requestType];

    if (records.length === 0) {
      // Create new record with appropriate counter set to 1
      await db.insert(userRateLimits).values({
        referenceId,
        syncApiRequests: requestType === "syncApi" ? 1 : 0,
        asyncApiRequests: requestType === "asyncApi" ? 1 : 0,
        apiEndpointRequests: requestType === "apiEndpoint" ? 1 : 0,
        windowStart: now,
        lastRequestAt: now,
      });

      return {
        allowed: true,
        remaining: limitForType - 1,
        limit: limitForType,
      };
    }

    const record = records[0];
    const windowExpired =
      now.getTime() - record.windowStart.getTime() > limits.windowMs;

    if (windowExpired) {
      // Reset window
      await db
        .update(userRateLimits)
        .set({
          syncApiRequests: requestType === "syncApi" ? 1 : 0,
          asyncApiRequests: requestType === "asyncApi" ? 1 : 0,
          apiEndpointRequests: requestType === "apiEndpoint" ? 1 : 0,
          windowStart: now,
          lastRequestAt: now,
          isRateLimited: false,
          rateLimitResetAt: null,
        })
        .where(eq(userRateLimits.referenceId, referenceId));

      return {
        allowed: true,
        remaining: limitForType - 1,
        limit: limitForType,
      };
    }

    // Check if already rate limited
    if (record.isRateLimited && record.rateLimitResetAt) {
      if (now < record.rateLimitResetAt) {
        const retryAfter = Math.ceil(
          (record.rateLimitResetAt.getTime() - now.getTime()) / 1000,
        );
        return {
          allowed: false,
          retryAfter,
          remaining: 0,
          limit: limitForType,
        };
      }
    }

    // Get current count based on request type
    const currentCount =
      requestType === "syncApi"
        ? record.syncApiRequests
        : requestType === "asyncApi"
          ? record.asyncApiRequests
          : record.apiEndpointRequests;

    if (currentCount >= limitForType) {
      // Set rate limited status
      const resetAt = new Date(record.windowStart.getTime() + limits.windowMs);

      await db
        .update(userRateLimits)
        .set({
          isRateLimited: true,
          rateLimitResetAt: resetAt,
          lastRequestAt: now,
        })
        .where(eq(userRateLimits.referenceId, referenceId));

      return {
        allowed: false,
        retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
        remaining: 0,
        limit: limitForType,
      };
    }

    // Increment the appropriate counter
    const incrementUpdate =
      requestType === "syncApi"
        ? { syncApiRequests: sql`${userRateLimits.syncApiRequests} + 1` }
        : requestType === "asyncApi"
          ? { asyncApiRequests: sql`${userRateLimits.asyncApiRequests} + 1` }
          : {
              apiEndpointRequests: sql`${userRateLimits.apiEndpointRequests} + 1`,
            };

    await db
      .update(userRateLimits)
      .set({
        ...incrementUpdate,
        lastRequestAt: now,
      })
      .where(eq(userRateLimits.referenceId, referenceId));

    return {
      allowed: true,
      remaining: limitForType - currentCount - 1,
      limit: limitForType,
    };
  } catch (error) {
    logger.error("Error checking rate limit", {
      referenceId,
      requestType,
      error,
    });

    // Fail open for rate limits (allow the request)
    return { allowed: true };
  }
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  referenceId: string,
  plan: string,
): Promise<{
  syncApi: { used: number; limit: number; resetAt: Date | null };
  asyncApi: { used: number; limit: number; resetAt: Date | null };
  apiEndpoint: { used: number; limit: number; resetAt: Date | null };
}> {
  const limits = RATE_LIMITS[plan as RateLimitPlan] || RATE_LIMITS.free;

  const records = await db
    .select()
    .from(userRateLimits)
    .where(eq(userRateLimits.referenceId, referenceId))
    .limit(1);

  if (records.length === 0) {
    return {
      syncApi: { used: 0, limit: limits.syncApi, resetAt: null },
      asyncApi: { used: 0, limit: limits.asyncApi, resetAt: null },
      apiEndpoint: { used: 0, limit: limits.apiEndpoint, resetAt: null },
    };
  }

  const record = records[0];
  const resetAt = new Date(record.windowStart.getTime() + limits.windowMs);

  return {
    syncApi: {
      used: record.syncApiRequests,
      limit: limits.syncApi,
      resetAt,
    },
    asyncApi: {
      used: record.asyncApiRequests,
      limit: limits.asyncApi,
      resetAt,
    },
    apiEndpoint: {
      used: record.apiEndpointRequests,
      limit: limits.apiEndpoint,
      resetAt,
    },
  };
}

// ==================== FEATURE ACCESS CHECKS ====================

/**
 * Check if user has access to a feature based on their plan
 */
export async function checkFeatureAccess(
  userId: string,
  feature: string,
): Promise<FeatureCheckResult> {
  const state = await getUserSubscriptionState(userId);

  const featureRequirements: Record<string, string[]> = {
    // Basic features available to all
    "basic-chat": ["free", "pro", "team", "enterprise"],
    "basic-agents": ["free", "pro", "team", "enterprise"],

    // Pro+ features
    "advanced-models": ["pro", "team", "enterprise"],
    "custom-instructions": ["pro", "team", "enterprise"],
    "api-access": ["pro", "team", "enterprise"],
    "priority-support": ["pro", "team", "enterprise"],

    // Team+ features
    "team-collaboration": ["team", "enterprise"],
    "shared-knowledge-bases": ["team", "enterprise"],
    "admin-dashboard": ["team", "enterprise"],
    "usage-analytics": ["team", "enterprise"],
    sso: ["team", "enterprise"],

    // Enterprise only
    "custom-integrations": ["enterprise"],
    "dedicated-support": ["enterprise"],
    sla: ["enterprise"],
    "audit-logs": ["enterprise"],
  };

  const allowedPlans = featureRequirements[feature];

  if (!allowedPlans) {
    logger.warn("Unknown feature requested", { feature, userId });
    return {
      allowed: false,
      currentPlan: state.planName,
      reason: "Unknown feature",
    };
  }

  const allowed = allowedPlans.includes(state.planName);

  if (!allowed) {
    const requiredPlan = allowedPlans[0]; // Minimum required plan
    return {
      allowed: false,
      requiredPlan,
      currentPlan: state.planName,
      reason: `This feature requires ${requiredPlan} plan or higher.`,
    };
  }

  return {
    allowed: true,
    currentPlan: state.planName,
  };
}

/**
 * Require a minimum plan level - throws if not met
 */
export async function requirePlan(
  userId: string,
  minimumPlan: "pro" | "team" | "enterprise",
): Promise<void> {
  const state = await getUserSubscriptionState(userId);

  const planHierarchy: Record<string, number> = {
    free: 0,
    pro: 1,
    team: 2,
    enterprise: 3,
  };

  const userLevel = planHierarchy[state.planName] || 0;
  const requiredLevel = planHierarchy[minimumPlan];

  if (userLevel < requiredLevel) {
    throw new UpgradeRequiredError(
      `This feature requires ${minimumPlan} plan or higher. You are on ${state.planName}.`,
      { currentPlan: state.planName, requiredPlan: minimumPlan },
    );
  }
}

// ==================== COMBINED CHECKS ====================

/**
 * Comprehensive pre-execution check combining rate limits and usage limits
 */
export async function preExecutionCheck(params: {
  chatId?: string;
  organizationId: string;
  userId: string;
  requestType?: RateLimitType;
}): Promise<{
  allowed: boolean;
  reason?: string;
  rateLimitInfo?: RateLimitResult;
  usageInfo?: ExecutionCheckResult;
}> {
  const { chatId, organizationId, userId, requestType = "syncApi" } = params;

  // Get user's plan for rate limit lookup
  const state = await getUserSubscriptionState(userId);

  // 1. Check rate limits first (fast)
  const rateLimit = await checkRateLimit(
    organizationId,
    requestType,
    state.planName,
  );

  if (!rateLimit.allowed) {
    return {
      allowed: false,
      reason: `Rate limit exceeded. Try again in ${rateLimit.retryAfter} seconds.`,
      rateLimitInfo: rateLimit,
    };
  }

  // 2. Check usage limits
  const usageCheck = chatId
    ? await canExecuteInChat(chatId, userId)
    : await canExecuteInOrganization(organizationId, userId);

  if (!usageCheck.allowed) {
    return {
      allowed: false,
      reason: usageCheck.reason,
      usageInfo: usageCheck,
      rateLimitInfo: rateLimit,
    };
  }

  return {
    allowed: true,
    rateLimitInfo: rateLimit,
    usageInfo: usageCheck,
  };
}

// ==================== CUSTOM ERRORS ====================

export class UpgradeRequiredError extends Error {
  public currentPlan: string;
  public requiredPlan: string;

  constructor(
    message: string,
    details: { currentPlan: string; requiredPlan: string },
  ) {
    super(message);
    this.name = "UpgradeRequiredError";
    this.currentPlan = details.currentPlan;
    this.requiredPlan = details.requiredPlan;
  }
}

export class RateLimitError extends Error {
  public retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class UsageLimitError extends Error {
  public currentUsage: number;
  public limit: number;

  constructor(
    message: string,
    details: { currentUsage: number; limit: number },
  ) {
    super(message);
    this.name = "UsageLimitError";
    this.currentUsage = details.currentUsage;
    this.limit = details.limit;
  }
}
