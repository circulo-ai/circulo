import { agent, chat, chatAgent, db, knowledgeBase } from "@/db";
import { Action, Metric } from "@/lib/billing/types";
import { count, eq } from "drizzle-orm";
import { SubscriptionManager } from "./subscription-manager";
import { UsageTracker } from "./usage-tracker";

function getBillingPeriod(subscriptionStartDate: Date, now = new Date()) {
  const start = new Date(subscriptionStartDate);
  const end = new Date(subscriptionStartDate);

  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  start.setMonth(start.getMonth() + monthsElapsed);
  end.setMonth(start.getMonth() + 1);

  return { periodStart: start, periodEnd: end };
}

// Type-safe action context
type ActionContext = {
  create_agent: void;
  create_chat: void;
  create_kb: void;
  add_chat_agent: { chatId: string };
  create_mcp_server: void;
};

export class UsageRateLimiter {
  /**
   * Enforce rate limit for API calls
   * Automatically tracks usage when called
   */
  static async enforce(
    userId: string,
    metric: Metric = "api_calls",
    count: number = 1,
    windowMs: number = 60_000,
  ): Promise<void> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      throw new Error("No active subscription");
    }

    const limit = subscription.features.rateLimitPerMinute;
    const exceeded = await UsageTracker.checkLimit(
      userId,
      metric,
      limit,
      windowMs,
    );

    if (exceeded) {
      throw new Error(
        `Rate limit exceeded. Your plan allows ${limit} requests per ${Math.floor(windowMs / 1000)} sec.`,
      );
    }

    await UsageTracker.track(userId, metric, count, subscription.id);
  }

  /**
   * Check if user can perform action based on quota
   * Type-safe with required context for each action
   */
  static async canPerformAction<T extends Action>(
    userId: string,
    action: T,
    context?: ActionContext[T],
  ): Promise<{
    allowed: boolean;
    reason?: string;
    current?: number;
    limit?: number;
  }> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      return { allowed: false, reason: "No active subscription" };
    }

    const features = subscription.features;

    switch (action) {
      case "create_agent": {
        const limit = features.maxAgents;
        if (limit === null) return { allowed: true };

        const [result] = await db
          .select({ count: count() })
          .from(agent)
          .where(eq(agent.userId, userId));

        const current = result?.count || 0;

        if (current >= limit) {
          return {
            allowed: false,
            reason: `Agent limit reached (${limit}). Upgrade your plan for more.`,
            current,
            limit,
          };
        }
        return { allowed: true, current, limit };
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
            current: chatCount,
            limit,
          };
        }
        return { allowed: true, current: chatCount, limit };
      }

      case "create_kb": {
        const limit = features.kbSlots;
        if (limit === null) return { allowed: true };

        const [result] = await db
          .select({ count: count() })
          .from(knowledgeBase)
          .where(eq(knowledgeBase.userId, userId));

        const current = result?.count || 0;

        if (current >= limit) {
          return {
            allowed: false,
            reason: `Knowledge base limit reached (${limit}). Upgrade for more.`,
            current,
            limit,
          };
        }
        return { allowed: true, current, limit };
      }

      case "add_chat_agent": {
        const limit = features.maxAgentsInChat;
        if (limit === null) return { allowed: true };

        // Context is required for this action
        if (!context || !("chatId" in context)) {
          throw new Error("chatId is required for add_chat_agent action");
        }

        const ctx = context as ActionContext["add_chat_agent"];

        // First verify the chat belongs to the user
        const [chatRecord] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, ctx.chatId))
          .limit(1);

        if (!chatRecord || chatRecord.creatorId !== userId) {
          return {
            allowed: false,
            reason: "Chat not found or unauthorized",
          };
        }

        // Count current agents in this chat
        const [result] = await db
          .select({ count: count() })
          .from(chatAgent)
          .where(eq(chatAgent.chatId, ctx.chatId));

        const current = result?.count || 0;

        if (current >= limit) {
          return {
            allowed: false,
            reason: `Agent per chat limit reached (${limit}). Upgrade for more.`,
            current,
            limit,
          };
        }
        return { allowed: true, current, limit };
      }

      default:
        return { allowed: false, reason: "Unknown action" };
    }
  }

  /**
   * Track usage without enforcing rate limit
   * Use for actions that don't count toward rate limits
   */
  static async trackOnly(
    userId: string,
    metric: string,
    count: number = 1,
  ): Promise<void> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);
    await UsageTracker.track(userId, metric, count, subscription?.id);
  }

  /**
   * Get current usage stats for a user
   */
  static async getUsageStats(userId: string) {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      return null;
    }

    const features = subscription.features;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all relevant counts
    const [agentCount] = await db
      .select({ count: count() })
      .from(agent)
      .where(eq(agent.userId, userId));

    const [kbCount] = await db
      .select({ count: count() })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.userId, userId));

    const chatsCreated = await UsageTracker.getUsage(
      userId,
      "chats_created",
      monthStart,
      now,
    );

    return {
      agents: {
        current: agentCount?.count || 0,
        limit: features.maxAgents,
      },
      knowledgeBases: {
        current: kbCount?.count || 0,
        limit: features.kbSlots,
      },
      chats: {
        current: chatsCreated,
        limit: features.maxChats,
        resetsAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
      rateLimitPerMinute: features.rateLimitPerMinute,
    };
  }
}
