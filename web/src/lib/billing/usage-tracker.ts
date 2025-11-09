import { db } from "@/db";
import { usageMetrics } from "@/db/schema/billing";
import { and, eq, gte, lte, sql } from "drizzle-orm";

type UsageEvent = {
  metric: string;
  count?: number;
  subscriptionId?: number;
};

export class UsageTracker {
  /**
   * Track usage metric
   */
  static async track(
    userId: string,
    metric: string,
    count = 1,
    subscriptionId?: number,
  ): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 1);

    await db
      .insert(usageMetrics)
      .values({
        userId,
        subscriptionId: subscriptionId || null,
        metric,
        count,
        recordedAt: now,
        periodStart,
        periodEnd,
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

  static async trackBatch(userId: string, events: UsageEvent[]): Promise<void> {
    const now = new Date();

    const records = events.map((event) => {
      const periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0); // Daily period
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 1);

      return {
        userId,
        subscriptionId: event.subscriptionId || null,
        metric: event.metric,
        count: event.count || 1,
        recordedAt: now,
        periodStart,
        periodEnd,
      };
    });

    await db
      .insert(usageMetrics)
      .values(records)
      .onConflictDoUpdate({
        target: [
          usageMetrics.userId,
          usageMetrics.metric,
          usageMetrics.periodStart,
        ],
        set: { count: sql`${usageMetrics.count} + EXCLUDED.count` },
      });
  }

  /**
   * Get usage for a period
   */
  static async getUsage(
    userId: string,
    metric: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const records = await db.query.usageMetrics.findMany({
      where: and(
        eq(usageMetrics.userId, userId),
        eq(usageMetrics.metric, metric),
        lte(usageMetrics.periodStart, periodEnd),
        gte(usageMetrics.periodEnd, periodStart),
      ),
    });

    return records.reduce((sum, record) => sum + record.count, 0);
  }

  /**
   * Check if user has exceeded limit
   */
  static async checkLimit(
    userId: string,
    metric: string,
    limit: number | null,
    windowMs: number = 60_000, // default 1 min
  ): Promise<boolean> {
    if (limit === null) return false;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    const usage = await this.getUsage(userId, metric, windowStart, now);
    return usage >= limit;
  }
}
