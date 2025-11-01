import { db } from "@/db";
import {
  subscription,
  subscriptionPlan,
  usageRecord,
  wallet,
  transaction,
  type TransactionType,
} from "@/db/schema";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import EntitlementsService from "./entitlements-service";
import type { UsageMetric } from "@/lib/billing/usage-metrics";
import { metricToTransactionType, resolveUnitPriceUSD } from "@/lib/billing/usage-metrics";
import { irrToUsd, fetchUsdToIrrRate } from "@/lib/fx/rates";
import { UsageService as BDKUsageService } from "@mhbdev/bdk/services"
import type { Money } from "@mhbdev/bdk";
import type {
  UsageRecord as BdkUsageRecord,
  UsageAggregate as BdkUsageAggregate,
  UsageCharges as BdkUsageCharges,
  UsageChargeLineItem as BdkUsageChargeLineItem,
} from "@mhbdev/bdk/services";

/**
 * UsageService
 *
 * Provides canConsume/applyConsumption for metered actions with allowances and overage billing.
 * - Respects plan metadata.rates configured per metric
 * - Enforces remainingIncluded allowances per billing period
 * - Bills overage at unit price (USD or IRR→USD conversion), with optional profit multipliers
 * - Supports hard/soft overage policies
 * - Records usage in usage_record and ledger entries in transaction
 * - Idempotency via details.idempotencyKey on usage_record.metadata
 *
 * Example:
 * const usage = new UsageService();
 * const check = await usage.canConsume(userId, "chat_tokens", 1200);
 * if (!check.allowed) throw new Error("limit");
 * const result = await usage.applyConsumption(userId, "chat_tokens", 1200, {
 *   idempotencyKey: `chat:${chatId}:msg:${msgId}`,
 *   metadata: { chatId, messageId: msgId, model: "gpt-4o" },
 * });
 */
export class UsageService extends BDKUsageService {
  private entitlements = new EntitlementsService();

  /**
   * Optional short-window rate limit using Redis counters
   */
  async checkRateLimit(
    userId: string,
    metric: UsageMetric,
    limitCount: number,
    windowSeconds: number = 60,
  ): Promise<{ allowed: boolean; count: number; key: string }> {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    return enforceRateLimit(userId, metric, limitCount, windowSeconds);
  }

  async canConsume(
    userId: string,
    metric: UsageMetric,
    quantity: number,
  ): Promise<{
    allowed: boolean;
    freeUnitsApplied: number;
    billableUnits: number;
    costUSD: number;
  }> {
    if (quantity <= 0) {
      return { allowed: true, freeUnitsApplied: 0, billableUnits: 0, costUSD: 0 };
    }

    const ent = await this.entitlements.getEntitlements(userId);
    const remainingIncluded = ent.usage[metric]?.remainingIncluded ?? 0;
    const freeUnitsApplied = Math.min(remainingIncluded, quantity);
    const billableUnits = Math.max(0, quantity - freeUnitsApplied);

    let costUSD = 0;
    if (billableUnits > 0) {
      const rate = ent.planRates?.rates?.[metric];
      if (!rate) throw new Error(`No rate defined for metric: ${metric}`);
      const resolved = await resolveUnitPriceUSD(rate, { irrToUsd, fetchUsdToIrrRate });
      const multiplier = (rate.multiplier ?? ent.profitMultiplier ?? 1);
      costUSD = Number((billableUnits * resolved.unitPriceUSD * multiplier).toFixed(4));
    }

    return {
      allowed: true, // canConsume returns affordability-independent allowance; affordability is enforced in applyConsumption for hard limits
      freeUnitsApplied,
      billableUnits,
      costUSD,
    };
  }

  async applyConsumption(
    userId: string,
    metric: UsageMetric,
    quantity: number,
    details?: {
      idempotencyKey?: string;
      metadata?: Record<string, any>;
      description?: string;
      policyOverride?: "hard" | "soft";
      profitMultiplierOverride?: number;
    },
  ): Promise<{
    allowed: boolean;
    freeUnitsApplied: number;
    billableUnits: number;
    costUSD: number;
    walletBalanceAfter?: number;
    pastDue?: boolean;
  }> {
    if (quantity <= 0) {
      return { allowed: true, freeUnitsApplied: 0, billableUnits: 0, costUSD: 0 };
    }

    // Idempotency: if a usage record exists with this key, return previous outcome
    if (details?.idempotencyKey) {
      const existing = await db
        .select({
          id: usageRecord.id,
          meta: usageRecord.metadata,
        })
        .from(usageRecord)
        .where(
          and(
            eq(usageRecord.userId, userId),
            sql`${usageRecord.metadata} ->> 'idempotencyKey' = ${details.idempotencyKey}`,
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        const meta = (existing[0].meta ?? {}) as Record<string, any>;
        const freeUnitsApplied = Number(meta.freeUnitsApplied ?? 0);
        const billableUnits = Number(meta.billableUnits ?? 0);
        const costUSD = Number(meta.costUSD ?? 0);
        const walletBalanceAfter = typeof meta.walletBalanceAfter === "number" ? meta.walletBalanceAfter : undefined;
        const pastDue = Boolean(meta.pastDue ?? false);
        const allowed = Boolean(meta.allowed ?? true);
        return { allowed, freeUnitsApplied, billableUnits, costUSD, walletBalanceAfter, pastDue };
      }
    }

    const res = await db.transaction(async (tx) => {
      // Resolve active subscription in-transaction
      const now = new Date();
      const sub = await tx.query.subscription.findFirst({
        where: and(
          eq(subscription.userId, userId),
          sql`${subscription.status} in ('active','trialing','past_due')`,
          gt(subscription.currentPeriodEnd, now),
          lt(subscription.currentPeriodStart, now),
        ),
        orderBy: (s, { desc }) => [desc(s.currentPeriodStart)],
      });
      if (!sub) throw new Error("No active subscription for user");

      // Recompute usage for metric within period
      const rows = await tx
        .select({ used: sql<number>`sum(${usageRecord.quantity})` })
        .from(usageRecord)
        .where(
          and(
            eq(usageRecord.subscriptionId, sub.id),
            eq(usageRecord.metric, metric),
            gt(usageRecord.timestamp, sub.currentPeriodStart),
            lt(usageRecord.timestamp, sub.currentPeriodEnd),
          ),
        );
      const usedSoFar = Number(rows[0]?.used ?? 0);

      // Plan rates
      const plan = await tx.query.subscriptionPlan.findFirst({ where: eq(subscriptionPlan.id, sub.planId) });
      const meta = (plan?.metadata ?? {}) as Record<string, any>;
      const rate = meta?.rates?.[metric];
      if (!rate) throw new Error(`No rate defined for metric: ${metric}`);

      const included: number = Number(rate.included ?? 0);
      const remainingIncluded = Math.max(0, included - usedSoFar);
      const freeUnitsApplied = Math.min(remainingIncluded, quantity);
      const billableUnits = Math.max(0, quantity - freeUnitsApplied);

      const resolved = await resolveUnitPriceUSD(rate, { irrToUsd, fetchUsdToIrrRate });
      const effectiveMultiplier = details?.profitMultiplierOverride ?? rate.multiplier ?? (meta?.profitMultiplier ?? 1);
      const costUSD = Number((billableUnits * resolved.unitPriceUSD * effectiveMultiplier).toFixed(4));

      // Determine overage policy
      const policy: "hard" | "soft" = details?.policyOverride ?? (meta?.overagePolicy ?? "hard");
      let pastDue = false;
      let walletBalanceAfter: number | undefined;

      // Always insert usage record (full quantity)
      const usageId = nanoid();

      // Apply wallet deduction if billable units > 0
      if (billableUnits > 0 && costUSD > 0) {
        // Ensure wallet exists
        let userWallet = await tx.query.wallet.findFirst({ where: eq(wallet.userId, userId) });
        if (!userWallet) {
          const walletId = nanoid();
          await tx.insert(wallet).values({ id: walletId, userId, balance: "0.00", currency: "USD", createdAt: new Date(), updatedAt: new Date() });
          userWallet = await tx.query.wallet.findFirst({ where: eq(wallet.userId, userId) });
        }

        const balanceBefore = Number(userWallet!.balance);
        const enough = balanceBefore >= costUSD;
        const txType: TransactionType = metricToTransactionType(metric);

        if (!enough && policy === "hard") {
          // Block hard limit: only record free units (if any) and return allowed=false
          if (freeUnitsApplied > 0) {
            await tx.insert(usageRecord).values({
              id: usageId,
              userId,
              subscriptionId: sub.id,
              metric,
              quantity: freeUnitsApplied,
              timestamp: new Date(),
              metadata: {
                ...(details?.metadata ?? {}),
                idempotencyKey: details?.idempotencyKey,
                fxRate: resolved.fxRate,
                fxSource: resolved.fxSource,
                unitPriceUSD: resolved.unitPriceUSD,
                freeUnitsApplied,
                billableUnits: 0,
                costUSD: 0,
                walletBalanceAfter: balanceBefore,
                pastDue: false,
                allowed: false,
              },
              createdAt: new Date(),
            });
          }
          return {
            allowed: false,
            freeUnitsApplied,
            billableUnits,
            costUSD,
            walletBalanceAfter: balanceBefore,
            pastDue: false,
          };
        }

        // Deduct if enough, else soft-policy allows overage and marks past_due
        if (enough) {
          const balanceAfter = Number((balanceBefore - costUSD).toFixed(2));
          await tx.update(wallet).set({ balance: String(balanceAfter), updatedAt: new Date() }).where(eq(wallet.id, userWallet!.id));
          await tx.insert(transaction).values({
            id: nanoid(),
            userId,
            walletId: userWallet!.id,
            type: txType,
            status: "completed",
            amount: String(costUSD.toFixed(4)),
            balanceBefore: String(balanceBefore.toFixed(2)),
            balanceAfter: String(balanceAfter.toFixed(2)),
            description: details?.description ?? `${metric} usage billing`,
            metadata: {
              ...(details?.metadata ?? {}),
              metric,
              billableUnits,
              unitPriceUSD: resolved.unitPriceUSD,
            },
            createdAt: new Date(),
          });
          walletBalanceAfter = balanceAfter;
        } else {
          // Soft policy: mark subscription past_due and do not deduct
          pastDue = true;
          await tx.update(subscription).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscription.id, sub.id));
          await tx.insert(transaction).values({
            id: nanoid(),
            userId,
            walletId: userWallet!.id,
            type: txType,
            status: "pending",
            amount: String(costUSD.toFixed(4)),
            balanceBefore: String(balanceBefore.toFixed(2)),
            balanceAfter: String(balanceBefore.toFixed(2)),
            description: details?.description ?? `${metric} usage billing (soft overage)`,
            metadata: {
              ...(details?.metadata ?? {}),
              metric,
              billableUnits,
              unitPriceUSD: resolved.unitPriceUSD,
              overagePolicy: policy,
            },
            createdAt: new Date(),
          });
          walletBalanceAfter = balanceBefore;
        }

        // Record usage
        await tx.insert(usageRecord).values({
          id: usageId,
          userId,
          subscriptionId: sub.id,
          metric,
          quantity,
          timestamp: new Date(),
          metadata: {
            ...(details?.metadata ?? {}),
            idempotencyKey: details?.idempotencyKey,
            fxRate: resolved.fxRate,
            fxSource: resolved.fxSource,
            unitPriceUSD: resolved.unitPriceUSD,
            freeUnitsApplied,
            billableUnits,
            costUSD,
            walletBalanceAfter,
            pastDue,
            allowed: true,
          },
          createdAt: new Date(),
        });
      } else {
        // No billable units: only record usage
        await tx.insert(usageRecord).values({
          id: usageId,
          userId,
          subscriptionId: sub.id,
          metric,
          quantity,
          timestamp: new Date(),
          metadata: {
            ...(details?.metadata ?? {}),
            idempotencyKey: details?.idempotencyKey,
            freeUnitsApplied,
            billableUnits,
            costUSD: 0,
            pastDue: false,
            allowed: true,
          },
          createdAt: new Date(),
        });
      }

      return {
        allowed: true,
        freeUnitsApplied,
        billableUnits,
        costUSD,
        walletBalanceAfter,
        pastDue,
      };
    });

    return res;
  }

  // --- BDK abstract methods implementation ---
  async recordUsage(
    customerId: string,
    subscriptionId: string,
    metric: string,
    quantity: number,
    timestamp?: Date,
    metadata?: Record<string, any>,
  ): Promise<BdkUsageRecord> {
    const id = nanoid();
    const createdAt = new Date();
    const ts = timestamp ?? createdAt;
    await db.insert(usageRecord).values({
      id,
      userId: customerId,
      subscriptionId,
      metric,
      quantity,
      timestamp: ts,
      metadata: metadata ?? {},
      createdAt,
    });
    return {
      id,
      customerId,
      subscriptionId,
      metric,
      quantity,
      timestamp: ts,
      metadata: metadata ?? undefined,
      createdAt,
      updatedAt: createdAt,
    };
  }

  async getUsage(
    subscriptionId: string,
    metric: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BdkUsageAggregate> {
    const rows = await db
      .select({
        id: usageRecord.id,
        userId: usageRecord.userId,
        quantity: usageRecord.quantity,
        timestamp: usageRecord.timestamp,
        metadata: usageRecord.metadata,
        createdAt: usageRecord.createdAt,
      })
      .from(usageRecord)
      .where(
        and(
          eq(usageRecord.subscriptionId, subscriptionId),
          eq(usageRecord.metric, metric),
          gt(usageRecord.timestamp, periodStart),
          lt(usageRecord.timestamp, periodEnd),
        ),
      );
    const totalQuantity = rows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
    const records: BdkUsageRecord[] = rows.map((r) => ({
      id: r.id,
      customerId: r.userId,
      subscriptionId,
      metric,
      quantity: r.quantity,
      timestamp: r.timestamp,
      metadata: (r.metadata ?? undefined) as Record<string, any> | undefined,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    }));
    return {
      metric,
      totalQuantity,
      periodStart,
      periodEnd,
      records,
    };
  }

  async listUsage(
    subscriptionId: string,
    filters?: {
      metric?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<BdkUsageRecord[]> {
    const conditions = [eq(usageRecord.subscriptionId, subscriptionId)];
    if (filters?.metric) conditions.push(eq(usageRecord.metric, filters.metric));
    if (filters?.dateFrom) conditions.push(gt(usageRecord.timestamp, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lt(usageRecord.timestamp, filters.dateTo));

    const rows = await db
      .select({
        id: usageRecord.id,
        userId: usageRecord.userId,
        subscriptionId: usageRecord.subscriptionId,
        metric: usageRecord.metric,
        quantity: usageRecord.quantity,
        timestamp: usageRecord.timestamp,
        metadata: usageRecord.metadata,
        createdAt: usageRecord.createdAt,
      })
      .from(usageRecord)
      .where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      customerId: r.userId,
      subscriptionId: r.subscriptionId,
      metric: r.metric,
      quantity: r.quantity,
      timestamp: r.timestamp,
      metadata: (r.metadata ?? undefined) as Record<string, any> | undefined,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    }));
  }

  async calculateCharges(
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BdkUsageCharges> {
    const sub = await db.query.subscription.findFirst({ where: eq(subscription.id, subscriptionId) });
    if (!sub) throw new Error("Subscription not found");

    const plan = await db.query.subscriptionPlan.findFirst({ where: eq(subscriptionPlan.id, sub.planId) });
    const meta = (plan?.metadata ?? {}) as Record<string, any>;

    const usageAgg = await db
      .select({
        metric: usageRecord.metric,
        total: sql<number>`sum(${usageRecord.quantity})`,
      })
      .from(usageRecord)
      .where(
        and(
          eq(usageRecord.subscriptionId, subscriptionId),
          gt(usageRecord.timestamp, periodStart),
          lt(usageRecord.timestamp, periodEnd),
        ),
      )
      .groupBy(usageRecord.metric);

    const lineItems: BdkUsageChargeLineItem[] = [];
    let totalAmount = 0;
    for (const agg of usageAgg) {
      const metricKey = agg.metric as string;
      const rate = meta?.rates?.[metricKey];
      if (!rate) continue;
      const included = Number(rate.included ?? 0);
      const used = Number(agg.total ?? 0);
      const billableUnits = Math.max(0, used - included);
      if (billableUnits <= 0) continue;

      const resolved = await resolveUnitPriceUSD(rate, { irrToUsd, fetchUsdToIrrRate });
      const multiplier = rate.multiplier ?? meta?.profitMultiplier ?? 1;
      const unitUSD = Number((resolved.unitPriceUSD * multiplier).toFixed(4));
      const amountUSD = Number((unitUSD * billableUnits).toFixed(4));
      totalAmount += amountUSD;

      const unitPrice: Money = { amount: unitUSD, currency: "USD" };
      const amount: Money = { amount: amountUSD, currency: "USD" };
      lineItems.push({ metric: metricKey, quantity: billableUnits, unitPrice, amount });
    }

    const total: Money = { amount: Number(totalAmount.toFixed(4)), currency: "USD" };
    return {
      subscriptionId,
      periodStart,
      periodEnd,
      lineItems,
      total,
    };
  }
}

export default UsageService;