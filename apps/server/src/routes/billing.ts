import { db } from "@/db";
import { agent, chat, message } from "@/db/schema";
import { getSubscriptionForOrg } from "@/lib/billing/autumn";
import { createRouter } from "@/lib/create-app";
import { isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, getBillingPlan } from "@circulo-ai/types";
import { and, count, eq, gte, lt, sum } from "drizzle-orm";

const router = createRouter();

function startOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function startOfDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function featureLimit(
  subscription: Awaited<ReturnType<typeof getSubscriptionForOrg>>,
  id: string,
): number | null {
  const feature = subscription?.features[id];
  if (!feature || feature.unlimited) return null;
  return feature.included_usage ?? null;
}

function planLimit(value: number | "unlimited" | undefined): number | null {
  return typeof value === "number" ? value : null;
}

router.get("/billing/subscriptions/current", requireAuth, async (c) => {
  const organizationId = c.var.activeOrgId;
  if (!organizationId) return c.json({ subscription: null }, 200);
  if (!(await isMemberOf(c.var.user!.id, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }

  const subscription = await getSubscriptionForOrg(organizationId);
  if (!subscription?.plan) return c.json({ subscription: null }, 200);

  const plan = getBillingPlan(subscription.plan);
  return c.json(
    {
      subscription: {
        plan: plan
          ? { id: plan.id, name: plan.name, description: plan.description }
          : { id: subscription.plan, name: subscription.plan },
        status: subscription.status,
        features: {
          maxMessagesPerDay:
            featureLimit(subscription, "max_messages_per_day") ??
            planLimit(plan?.features.maxMessagesPerDay),
          rateLimitPerMinute:
            featureLimit(subscription, "rate_limit_per_minute") ??
            planLimit(plan?.features.rateLimitPerMinute),
          kbSlots:
            featureLimit(subscription, "kb_slots") ??
            planLimit(plan?.features.kbSlots),
          maxAgents:
            featureLimit(subscription, "max_agents") ??
            planLimit(plan?.features.maxAgents),
          maxChats:
            featureLimit(subscription, "max_chats") ??
            planLimit(plan?.features.maxChats),
          teamMembers:
            featureLimit(subscription, "team_members") ??
            planLimit(plan?.features.teamMembers),
          maxAgentsInChat:
            featureLimit(subscription, "max_agents_in_chat") ??
            planLimit(plan?.features.maxAgentsInChat),
        },
      },
    },
    200,
  );
});

router.get("/billing/usage/current", requireAuth, async (c) => {
  const organizationId = c.var.activeOrgId;
  if (!organizationId) return c.json({ usage: {}, stats: {} }, 200);
  if (!(await isMemberOf(c.var.user!.id, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const nextMonth = startOfNextMonth(now);
  const dayStart = startOfDay(now);
  const subscription = await getSubscriptionForOrg(organizationId);

  const [agentCount, chatCount, monthlyMessageCount, todayMessageCount, cost] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(agent)
        .where(
          and(
            eq(agent.organizationId, organizationId),
            eq(agent.isArchived, false),
          ),
        ),
      db
        .select({ count: count() })
        .from(chat)
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(chat.isDeleted, false),
            gte(chat.createdAt, monthStart),
            lt(chat.createdAt, nextMonth),
          ),
        ),
      db
        .select({ count: count() })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(message.role, "user"),
            gte(message.createdAt, monthStart),
            lt(message.createdAt, nextMonth),
          ),
        ),
      db
        .select({ count: count() })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(message.role, "user"),
            gte(message.createdAt, dayStart),
            lt(message.createdAt, now),
          ),
        ),
      db
        .select({ total: sum(message.cost) })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.organizationId, organizationId),
            gte(message.createdAt, monthStart),
            lt(message.createdAt, nextMonth),
          ),
        ),
    ]);

  const currentAgents = agentCount[0]?.count ?? 0;
  const chatsCreated = chatCount[0]?.count ?? 0;
  const apiCalls = monthlyMessageCount[0]?.count ?? 0;
  const chatMessagesToday = todayMessageCount[0]?.count ?? 0;

  return c.json({
    usage: {
      api_calls: apiCalls,
      chat_messages_today: chatMessagesToday,
      chats_created: chatsCreated,
      cost_usd: Number(cost[0]?.total ?? 0),
    },
    periodStart: monthStart.toISOString(),
    periodEnd: nextMonth.toISOString(),
    stats: {
      agents: {
        current: currentAgents,
        limit: featureLimit(subscription, "max_agents"),
      },
      knowledgeBases: {
        current: 0,
        limit: featureLimit(subscription, "kb_slots"),
      },
      chats: {
        current: chatsCreated,
        limit: featureLimit(subscription, "max_chats"),
        resetsAt: nextMonth.toISOString(),
      },
      rateLimitPerMinute: featureLimit(subscription, "rate_limit_per_minute"),
    },
  });
});

export default router;
