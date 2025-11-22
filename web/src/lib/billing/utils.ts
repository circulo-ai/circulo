import { db, userRateLimits } from "@/db";
import { getSimplifiedBillingSummary } from "@/lib/billing/core/billing";
import { getUserSubscriptionState } from "@/lib/billing/core/subscription";
import { SubscriptionPlan } from "@/services/queue";
import { eq } from "drizzle-orm";

const RATE_LIMITS = {
  free: { syncApi: 60, asyncApi: 10, window: 60000 },
  pro: { syncApi: 300, asyncApi: 50, window: 60000 },
  team: { syncApi: 1000, asyncApi: 200, window: 60000 },
  enterprise: { syncApi: 5000, asyncApi: 1000, window: 60000 },
};

export async function checkRateLimit(
  referenceId: string, // orgId for pooled, userId for individual
  requestType: "sync" | "async",
  plan: SubscriptionPlan,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const now = new Date();

  const record = await db
    .select()
    .from(userRateLimits)
    .where(eq(userRateLimits.referenceId, referenceId))
    .limit(1);

  if (record.length === 0) {
    // Create new record
    await db.insert(userRateLimits).values({
      referenceId,
      syncApiRequests: requestType === "sync" ? 1 : 0,
      asyncApiRequests: requestType === "async" ? 1 : 0,
      windowStart: now,
      lastRequestAt: now,
    });
    return { allowed: true };
  }

  const r = record[0];
  const windowExpired = now.getTime() - r.windowStart.getTime() > limits.window;

  if (windowExpired) {
    // Reset window
    await db
      .update(userRateLimits)
      .set({
        syncApiRequests: requestType === "sync" ? 1 : 0,
        asyncApiRequests: requestType === "async" ? 1 : 0,
        windowStart: now,
        lastRequestAt: now,
        isRateLimited: false,
      })
      .where(eq(userRateLimits.referenceId, referenceId));
    return { allowed: true };
  }

  const currentCount =
    requestType === "sync" ? r.syncApiRequests : r.asyncApiRequests;
  const limit = requestType === "sync" ? limits.syncApi : limits.asyncApi;

  if (currentCount >= limit) {
    const resetAt = new Date(r.windowStart.getTime() + limits.window);
    return {
      allowed: false,
      retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    };
  }

  // Increment counter
  await db
    .update(userRateLimits)
    .set({
      [requestType === "sync" ? "syncApiRequests" : "asyncApiRequests"]:
        currentCount + 1,
      lastRequestAt: now,
    })
    .where(eq(userRateLimits.referenceId, referenceId));

  return { allowed: true };
}

async function checkFeatureAccess(userId: string, feature: string) {
  const state = await getUserSubscriptionState(userId);

  const featureRequirements: Record<string, () => boolean> = {
    "advanced-analytics": () =>
      state.isPro || state.isTeam || state.isEnterprise,
    "team-collaboration": () => state.isTeam || state.isEnterprise,
    "custom-integrations": () => state.isEnterprise,
    "api-access": () => !state.isFree,
  };

  return featureRequirements[feature]?.() ?? false;
}

async function checkOrganizationUsage(userId: string, organizationId: string) {
  const summary = await getSimplifiedBillingSummary(userId, organizationId);

  return {
    totalUsage: summary.organizationData?.totalCurrentUsage || 0,
    limit: summary.organizationData?.totalBasePrice || 0,
    isExceeded: summary.isExceeded,
    seatsUsed: summary.organizationData?.memberCount || 0,
    seatsTotal: summary.organizationData?.seatCount || 0,
  };
}
