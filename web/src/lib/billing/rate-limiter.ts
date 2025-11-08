import { agent, db, knowledgeBase } from "@/db";
import { count, eq } from "drizzle-orm";
import { SubscriptionManager } from "./subscription-manager";
import { UsageTracker } from "./usage-tracker";

function getBillingPeriod(subscriptionStartDate: Date, now = new Date()) {
  const start = new Date(subscriptionStartDate);
  const end = new Date(subscriptionStartDate);

  // Calculate months elapsed since subscription started
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  // Current period start
  start.setMonth(start.getMonth() + monthsElapsed);

  // Current period end (one month after period start)
  end.setMonth(start.getMonth() + 1);

  return { periodStart: start, periodEnd: end };
}

export class UsageRateLimiter {

  /**
   * Enforce rate limit for API calls
   * Automatically tracks usage when called
   */
  static async enforce(
    userId: string,
    metric: string = "api_calls",
    windowMs: number = 60_000
  ): Promise<void> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      throw new Error("No active subscription");
    }

    const limit = subscription.features.rateLimitPerMinute;
    const exceeded = await UsageTracker.checkLimit(userId, metric, limit, windowMs);

    if (exceeded) {
      throw new Error(
        `Rate limit exceeded. Your plan allows ${limit} requests per minute.`,
      );
    }

    // Automatically track this usage
    await UsageTracker.track(userId, metric, 1, subscription.id);
  }

  /**
   * Check if user can perform action based on quota
   */
  static async canPerformAction(
    userId: string,
    action: "create_agent" | "create_chat" | "create_kb",
  ): Promise<{ allowed: boolean; reason?: string }> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      return { allowed: false, reason: "No active subscription" };
    }

    const features = subscription.features;

    // Check limits based on action
    switch (action) {
      case "create_agent": {
        const limit = features.maxAgents;
        if (limit === null) return { allowed: true };

        const [result] = await db
          .select({ count: count() })
          .from(agent)
          .where(eq(agent.userId, userId));

        if (result && result.count >= limit) {
          return {
            allowed: false,
            reason: `Agent limit reached (${limit}). Upgrade your plan for more.`,
          };
        }
        break;
      }

      case "create_chat": {
        const limit = features.maxChats;
        if (limit === null) return { allowed: true };

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const chatCount = await UsageTracker.getUsage(
          userId,
          "chats_created",
          monthStart,
          now,
        );

        if (chatCount >= limit) {
          return {
            allowed: false,
            reason: `Monthly chat limit reached (${limit}). Resets next month.`,
          };
        }
        break;
      }

      case "create_kb": {
        const limit = features.kbSlots;
        if (limit === null) return { allowed: true };

        const [result] = await db
          .select({ count: count() })
          .from(knowledgeBase)
          .where(eq(knowledgeBase.userId, userId));

        if (result && result.count >= limit) {
          return {
            allowed: false,
            reason: `Knowledge base limit reached (${limit}). Upgrade for more.`,
          };
        }
        break;
      }
    }

    return { allowed: true };
  }

  /**
   * Track usage without enforcing rate limit
   * Use for actions that don't count toward rate limits
   */
  static async trackOnly(
    userId: string,
    metric: string,
    count: number = 1
  ): Promise<void> {
    const subscription = await SubscriptionManager.getActiveSubscription(userId);
    await UsageTracker.track(userId, metric, count, subscription?.id);
  }
}
