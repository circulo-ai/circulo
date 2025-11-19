import { agent, chat, chatAgent, db, knowledgeBase } from "@/db";
import { Action, Metric } from "@/lib/billing/types";
import { count, eq } from "drizzle-orm";
import { SubscriptionManager } from "./subscription-manager";
import { UsageTracker } from "./usage-tracker";

/**
 * Calculates the current billing period based on the subscription start date.
 * Example: User subscribed on Jan 15th.
 * - If today is March 10th -> Period is Feb 15th to March 15th.
 * - If today is March 20th -> Period is March 15th to April 15th.
 */
function getBillingCycle(subscriptionStartDate: Date) {
  const now = new Date();
  const anchorDay = subscriptionStartDate.getUTCDate();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  // 1. Try to set the start date to this month's "anchor day"
  let start = new Date(Date.UTC(currentYear, currentMonth, anchorDay));

  // 2. If today is BEFORE that date (e.g. Today is 5th, Anchor is 15th),
  // then the cycle actually started last month.
  if (now < start) {
    start.setUTCMonth(currentMonth - 1);
    // Handle edge case: Last month might not have the anchor day (e.g. Feb 30th)
    // JS automatically rolls this over (Feb 30 -> Mar 2), which is usually fine,
    // or you can clamp it to the last day of the month.
  }

  // 3. End is exactly 1 month after start
  const end = new Date(start);
  end.setUTCMonth(start.getUTCMonth() + 1);

  return { start, end };
}

type ActionContext = {
  create_agent: void;
  create_chat: void;
  create_kb: void;
  add_chat_agent: { chatId: string };
  create_mcp_server: void;
  create_tool: void;
};

export class UsageRateLimiter {
  /**
   * Enforce Rate Limits AND Track Usage
   */
  static async enforce(
    userId: string,
    metric: Metric = "api_calls",
    quantity: number = 1,
  ): Promise<void> {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);

    if (!subscription) {
      throw new Error("No active subscription");
    }

    // 1. TRACK USAGE (Billing)
    await UsageTracker.track(userId, metric, quantity, subscription.id);

    // 2. CHECK LIMITS (Optional Postgres check)
    // Rate limiting should be done via Redis Middleware.
    // If you wanted to check MONTHLY API quotas here:
    /*
    if (subscription.features.maxMessagesPerDay) {
        // For daily limits, we just need today's boundaries
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);

        const usage = await UsageTracker.getUsage(userId, metric, start, end);
        if (usage >= subscription.features.maxMessagesPerDay) { ... }
    }
    */
  }

  /**
   * Check if user can perform action based on plan quotas
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

        // FIX: Use the subscription's start date to calculate the cycle
        const { start, end } = getBillingCycle(subscription.startDate);

        const chatCount = await UsageTracker.getUsage(
          userId,
          "chats_created",
          start,
          end,
        );

        if (chatCount >= limit) {
          return {
            allowed: false,
            reason: `Monthly chat limit reached (${limit}). Resets on ${end.toLocaleDateString()}.`,
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

        if (!context || !("chatId" in context)) {
          throw new Error("chatId is required for add_chat_agent action");
        }

        const ctx = context as ActionContext["add_chat_agent"];

        const [chatRecord] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, ctx.chatId));

        if (!chatRecord || chatRecord.creatorId !== userId) {
          return { allowed: false, reason: "Chat not found or unauthorized" };
        }

        const [result] = await db
          .select({ count: count() })
          .from(chatAgent)
          .where(eq(chatAgent.chatId, ctx.chatId));

        const current = result?.count || 0;

        if (current >= limit) {
          return {
            allowed: false,
            reason: `Agent per chat limit reached (${limit}).`,
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
   * Get current usage stats for a user
   */
  static async getUsageStats(userId: string) {
    const subscription =
      await SubscriptionManager.getActiveSubscription(userId);
    if (!subscription) return null;

    const features = subscription.features;

    // FIX: Use the subscription's start date
    const { start, end } = getBillingCycle(subscription.startDate);

    const [agentRes, kbRes, chatsCreated] = await Promise.all([
      db.select({ count: count() }).from(agent).where(eq(agent.userId, userId)),
      db
        .select({ count: count() })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.userId, userId)),
      UsageTracker.getUsage(userId, "chats_created", start, end),
    ]);

    return {
      agents: {
        current: agentRes[0]?.count || 0,
        limit: features.maxAgents,
      },
      knowledgeBases: {
        current: kbRes[0]?.count || 0,
        limit: features.kbSlots,
      },
      chats: {
        current: chatsCreated,
        limit: features.maxChats,
        resetsAt: end,
      },
      rateLimitPerMinute: features.rateLimitPerMinute,
    };
  }
}
