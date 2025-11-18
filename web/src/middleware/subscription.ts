import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { Metric } from "@/lib/billing/types";
import { NextResponse } from "next/server";

/**
 * Middleware to check if user has active subscription
 */
export async function requireSubscription(
  userId: string,
): Promise<NextResponse | null> {
  const subscription = await SubscriptionManager.getActiveSubscription(userId);

  if (!subscription) {
    return NextResponse.json(
      {
        error: "Active subscription required",
        code: "SUBSCRIPTION_REQUIRED",
      },
      { status: 403 },
    );
  }

  return null; // No error, proceed
}

/**
 * Middleware to enforce rate limits
 */
export async function enforceRateLimit(
  userId: string,
  metric?: Metric,
  windowMs: number = 60000,
): Promise<NextResponse | null> {
  try {
    await UsageRateLimiter.enforce(userId, metric, windowMs);
    return null;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED",
      },
      { status: 429 },
    );
  }
}

/**
 * Middleware to check feature access
 */
export async function requireFeature(
  userId: string,
  feature: "dedicatedSupport",
): Promise<NextResponse | null> {
  const subscription = await SubscriptionManager.getActiveSubscription(userId);

  if (!subscription) {
    return NextResponse.json(
      { error: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 },
    );
  }

  const hasFeature = subscription.features[feature];

  if (!hasFeature) {
    return NextResponse.json(
      {
        error: `This feature requires a plan with ${feature}`,
        code: "FEATURE_NOT_AVAILABLE",
        upgradeRequired: true,
      },
      { status: 403 },
    );
  }

  return null;
}
