import { db } from '@/db';
import { usageRecords, usageMetrics } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { UsageService, UsageRecord as BdkUsageRecord, UsageAggregate, UsageFilters, UsageCharges, UsageChargeLineItem } from '@mhbdev/bdk/services';
import { Money } from '@mhbdev/bdk/core';
import { randomUUID } from 'crypto';

export class DatabaseUsageService extends UsageService {
  async recordUsage(customerId: string, subscriptionId: string, metric: string, quantity: number, timestamp?: Date, metadata?: Record<string, any>): Promise<BdkUsageRecord> {
    const id = randomUUID();
    const ts = timestamp || new Date();
    await db.insert(usageRecords).values({ id, userId: customerId, subscriptionId, metric, quantity, timestamp: ts, createdAt: ts, metadata: metadata || null }).execute();
    return { id, customerId, subscriptionId, metric, quantity, timestamp: ts, metadata, createdAt: ts, updatedAt: ts } as BdkUsageRecord;
  }

  async getUsage(subscriptionId: string, metric: string, periodStart: Date, periodEnd: Date): Promise<UsageAggregate> {
    const rows = await db.select().from(usageRecords).where(and(eq(usageRecords.subscriptionId, subscriptionId), eq(usageRecords.metric, metric), gte(usageRecords.timestamp, periodStart), lte(usageRecords.timestamp, periodEnd))).execute();
    const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
    const records: BdkUsageRecord[] = rows.map((r) => ({ id: r.id, customerId: r.userId, subscriptionId: r.subscriptionId, metric: r.metric, quantity: r.quantity, timestamp: new Date(r.timestamp!), metadata: r.metadata || undefined, createdAt: new Date(r.createdAt!), updatedAt: new Date(r.createdAt!) } as BdkUsageRecord));
    return { metric, totalQuantity, periodStart, periodEnd, records };
  }

  async listUsage(subscriptionId: string, filters?: UsageFilters): Promise<BdkUsageRecord[]> {
    const where = [eq(usageRecords.subscriptionId, subscriptionId)];
    if (filters?.metric) where.push(eq(usageRecords.metric, filters.metric));
    if (filters?.dateFrom) where.push(gte(usageRecords.timestamp, filters.dateFrom));
    if (filters?.dateTo) where.push(lte(usageRecords.timestamp, filters.dateTo));
    const rows = await db.select().from(usageRecords).where(and(...where)).execute();
    return rows.map((r) => ({ id: r.id, customerId: r.userId, subscriptionId: r.subscriptionId, metric: r.metric, quantity: r.quantity, timestamp: new Date(r.timestamp!), metadata: r.metadata || undefined, createdAt: new Date(r.createdAt!), updatedAt: new Date(r.createdAt!) } as BdkUsageRecord));
  }

  async calculateCharges(subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<UsageCharges> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(usageRecords)
        .where(and(
          eq(usageRecords.subscriptionId, subscriptionId),
          gte(usageRecords.timestamp, periodStart),
          lte(usageRecords.timestamp, periodEnd)
        ))
        .execute();

      const grouped = new Map<string, number>();
      for (const r of rows) {
        grouped.set(r.metric, (grouped.get(r.metric) || 0) + r.quantity);
      }

      // Batch load pricing for all metrics to avoid per-metric queries
      const metricsList = Array.from(grouped.keys());
      const pricingRows = metricsList.length
        ? await tx.select().from(usageMetrics)
            .where(and(eq(usageMetrics.subscriptionId, subscriptionId)))
            .execute()
        : [];
      const pricingMap = new Map<string, { amount: number; currency: string }>();
      for (const pr of pricingRows) {
        pricingMap.set(pr.metric, { amount: Number(pr.unitPriceAmount), currency: pr.unitPriceCurrency });
      }

      const lineItems: UsageChargeLineItem[] = [];
      let totalAmount = 0;
      for (const [metric, quantity] of grouped) {
        const pricing = pricingMap.get(metric);
        if (!pricing) continue;
        const unitPrice: Money = { amount: pricing.amount, currency: pricing.currency };
        const amount = unitPrice.amount * quantity;
        lineItems.push({ metric, quantity, unitPrice, amount: { amount, currency: unitPrice.currency } });
        totalAmount += amount;
      }
      const currency = lineItems[0]?.unitPrice.currency || 'IRT';
      return { subscriptionId, periodStart, periodEnd, lineItems, total: { amount: totalAmount, currency } };
    });
  }
}