import { db } from "@/db";
import { subscription, subscriptionPlan, usageRecord } from "@/db/schema";
import { and, eq, sql, gt, lt } from "drizzle-orm";
import { z } from "zod";
import type { UsageMetric, PlanRatesMetadata } from "@/lib/billing/usage-metrics";

const RatesSchema = z.object({
  rates: z.record(
    z.string(),
    z.object({
      included: z.number().int().nonnegative(),
      unitPriceUSD: z.number().positive().optional(),
      unitPriceIRR: z.number().positive().optional(),
      multiplier: z.number().positive().optional(),
    }),
  ),
  overagePolicy: z.enum(["hard", "soft"]).optional(),
  profitMultiplier: z.number().positive().optional(),
});

export type Entitlements = {
  userId: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    planId: string;
  } | null;
  planRates: PlanRatesMetadata | null;
  overagePolicy: "hard" | "soft";
  profitMultiplier: number;
  usage: Record<UsageMetric, { used: number; included: number; remainingIncluded: number }>;
};

/**
 * EntitlementsService
 *
 * Resolves a user's active subscription and computes remaining included units per metric
 * for the current billing period, based on subscription_plan.metadata.rates.
 * Use this before metered actions to inform allowance and overage billing decisions.
 */
export class EntitlementsService {
  async getEntitlements(userId: string): Promise<Entitlements> {
    // Resolve active/trialing subscription within current period
    const now = new Date();
    const sub = await db.query.subscription.findFirst({
      where: and(
        eq(subscription.userId, userId),
        sql`${subscription.status} in ('active','trialing')`,
        gt(subscription.currentPeriodEnd, now),
        lt(subscription.currentPeriodStart, now),
      ),
      orderBy: (s, { desc }) => [desc(s.currentPeriodStart)],
    });

    if (!sub) {
      return {
        userId,
        subscription: null,
        planRates: null,
        overagePolicy: "hard",
        profitMultiplier: 1,
        usage: {
          chat_tokens: { used: 0, included: 0, remainingIncluded: 0 },
          image_requests: { used: 0, included: 0, remainingIncluded: 0 },
          embeddings_calls: { used: 0, included: 0, remainingIncluded: 0 },
          assistant_calls: { used: 0, included: 0, remainingIncluded: 0 },
          audio_minutes: { used: 0, included: 0, remainingIncluded: 0 },
        },
      };
    }

    // Load plan and parse rates metadata
    const plan = await db.query.subscriptionPlan.findFirst({
      where: eq(subscriptionPlan.id, sub.planId),
    });
    const rawMeta = (plan?.metadata ?? {}) as Record<string, any>;
    const parsed = RatesSchema.safeParse(rawMeta);
    const planRates: PlanRatesMetadata | null = parsed.success ? (parsed.data as PlanRatesMetadata) : null;
    const overagePolicy = planRates?.overagePolicy ?? "hard";
    const profitMultiplier = planRates?.profitMultiplier ?? 1;

    // Aggregate usage in current period per metric
    const usageRows = await db
      .select({
        metric: usageRecord.metric,
        used: sql<number>`sum(${usageRecord.quantity})`,
      })
      .from(usageRecord)
      .where(
        and(
          eq(usageRecord.subscriptionId, sub.id),
          gt(usageRecord.timestamp, sub.currentPeriodStart),
          lt(usageRecord.timestamp, sub.currentPeriodEnd),
        ),
      )
      .groupBy(usageRecord.metric);

    const usedMap = new Map<UsageMetric, number>();
    for (const row of usageRows) {
      usedMap.set(row.metric as UsageMetric, Number(row.used) || 0);
    }

    const baseMetrics: UsageMetric[] = [
      "chat_tokens",
      "image_requests",
      "embeddings_calls",
      "assistant_calls",
      "audio_minutes",
    ];

    const usage: Entitlements["usage"] = {} as any;
    for (const m of baseMetrics) {
      const included = planRates?.rates?.[m]?.included ?? 0;
      const used = usedMap.get(m) ?? 0;
      usage[m] = {
        used,
        included,
        remainingIncluded: Math.max(0, included - used),
      };
    }

    return {
      userId,
      subscription: {
        id: sub.id,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        planId: sub.planId,
      },
      planRates,
      overagePolicy,
      profitMultiplier,
      usage,
    };
  }
}

export default EntitlementsService;