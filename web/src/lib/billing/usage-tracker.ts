import { db } from "@/db";
import { usageMetrics } from "@/db/schema/billing";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { and, eq, gte, lte, sql } from "drizzle-orm";

type UsageEvent = {
  metric: string;
  count?: number;
  subscriptionId?: number;
};

export class UsageTracker {
  /**
   * Helper to get UTC start of day to ensure consistency across server timezones
   */
  private static getDayBoundaries(date: Date = new Date()) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
  }

  /**
   * Track a single usage event
   */
  static async track(
    userId: string,
    metric: string,
    count = 1,
    subscriptionId?: number,
  ): Promise<void> {
    const { start, end } = this.getDayBoundaries();
    const activeSubscription =
      await SubscriptionManager.getActiveSubscription(userId);

    await db
      .insert(usageMetrics)
      .values({
        userId,
        subscriptionId: subscriptionId || activeSubscription?.id || undefined,
        metric,
        count,
        recordedAt: new Date(),
        periodStart: start,
        periodEnd: end,
      })
      .onConflictDoUpdate({
        target: [
          usageMetrics.userId,
          usageMetrics.metric,
          usageMetrics.periodStart,
        ],
        set: { count: sql`${usageMetrics.count} + ${count}` },
      });
  }

  /**
   * Track multiple events at once (optimized)
   */
  static async trackBatch(userId: string, events: UsageEvent[]): Promise<void> {
    if (events.length === 0) return;

    const { start, end } = this.getDayBoundaries();

    // Pre-aggregate in memory to prevent duplicate key errors
    const aggregated = new Map<string, { count: number; subId?: number }>();

    for (const event of events) {
      const current = aggregated.get(event.metric) || {
        count: 0,
        subId: event.subscriptionId,
      };
      aggregated.set(event.metric, {
        count: current.count + (event.count || 1),
        subId: event.subscriptionId,
      });
    }

    const records = Array.from(aggregated.entries()).map(([metric, data]) => ({
      userId,
      subscriptionId: data.subId || null,
      metric,
      count: data.count,
      recordedAt: new Date(),
      periodStart: start,
      periodEnd: end,
    }));

    await db
      .insert(usageMetrics)
      .values(records)
      .onConflictDoUpdate({
        target: [
          usageMetrics.userId,
          usageMetrics.metric,
          usageMetrics.periodStart,
        ],
        set: { count: sql`${usageMetrics.count} + excluded.count` },
      });
  }

  /**
   * Get usage for a period
   * Used by UsageRateLimiter to calculate billing cycles
   */
  static async getUsage(
    userId: string,
    metric: string,
    periodStart: Date = new Date(0),
    periodEnd: Date = new Date(),
  ): Promise<number> {
    const [result] = await db
      .select({
        total: sql<number>`sum(${usageMetrics.count})`.mapWith(Number),
      })
      .from(usageMetrics)
      .where(
        and(
          eq(usageMetrics.userId, userId),
          eq(usageMetrics.metric, metric),
          // Sums up all DAILY buckets that fall within the requested range
          lte(usageMetrics.periodStart, periodEnd),
          gte(usageMetrics.periodEnd, periodStart),
        ),
      );

    return result?.total || 0;
  }
}
