import type { BillingContext, BillingStrategy } from "@mhbdev/bdk";
import { Money, Subscription, SubscriptionPlan, InvoiceLineItem, SubscriptionStatus } from "@mhbdev/bdk";

type UsageTier = { upTo: number; unitPrice: number }; // price per unit within tier

export interface DefaultStrategyConfig {
  usageUnit?: "tokens" | "messages" | "requests" | string;
  usageTiers?: UsageTier[]; // ascending by upTo
  freeUnitsPerPeriod?: number; // e.g., free tokens/messages included
  taxRatePercent?: number; // optional tax added externally by InvoiceService
}

/**
 * ChatGPT-like billing strategy: base subscription + usage-based tiers.
 * - Supports proration for mid-period start/change using time fraction.
 * - Usage pricing via ascending tiers and optional free units.
 */
export class DefaultBillingStrategy implements BillingStrategy {
  constructor(private config: DefaultStrategyConfig = {}) {}

  async calculateAmount(subscription: Subscription, plan: SubscriptionPlan, context: BillingContext): Promise<Money> {
    const base = plan.price;
    const periodMs = context.periodEnd.getTime() - context.periodStart.getTime();
    const remainingMs = context.periodEnd.getTime() - context.currentDate.getTime();
    const fraction = context.isProration ? Math.max(0, Math.min(1, remainingMs / periodMs)) : 1;

    const baseAmount = round2(base.amount * fraction);
    const usageAmount = this.computeUsageCharge(context);

    return { amount: round2(baseAmount + usageAmount), currency: base.currency };
  }

  async shouldBill(subscription: Subscription, context: BillingContext): Promise<boolean> {
    const activeStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE, SubscriptionStatus.PAUSED]; // exclude canceled/expired
    return activeStatuses.includes(subscription.status);
  }

  async generateLineItems(subscription: Subscription, plan: SubscriptionPlan, context: BillingContext): Promise<InvoiceLineItem[]> {
    const base = plan.price;
    const periodMs = context.periodEnd.getTime() - context.periodStart.getTime();
    const remainingMs = context.periodEnd.getTime() - context.currentDate.getTime();
    const fraction = context.isProration ? Math.max(0, Math.min(1, remainingMs / periodMs)) : 1;

    const items: InvoiceLineItem[] = [];
    // Base subscription fee (prorated if applicable)
    const proratedBase = round2(base.amount * fraction);
    items.push({
      description: fraction < 1 ? `${plan.name} (prorated)` : `${plan.name} subscription`,
      quantity: 1,
      unitAmount: { amount: proratedBase, currency: base.currency },
      amount: { amount: proratedBase, currency: base.currency },
      metadata: { interval: plan.interval, intervalCount: plan.intervalCount, prorationFraction: fraction },
    });

    // Usage-based charges
    const units = this.getUsageUnits(context);
    const freeUnits = this.config.freeUnitsPerPeriod ?? 0;
    const billableUnits = Math.max(0, units - freeUnits);
    if (billableUnits > 0) {
      const unitCharge = this.computeUsageCharge(context);
      items.push({
        description: `${billableUnits} ${this.config.usageUnit ?? "units"} usage`,
        quantity: billableUnits,
        unitAmount: { amount: round2(unitCharge / billableUnits), currency: base.currency },
        amount: { amount: round2(unitCharge), currency: base.currency },
        metadata: { freeUnits, totalUnits: units },
      });
    }

    return items;
  }

  private getUsageUnits(context: BillingContext): number {
    const key = this.config.usageUnit ?? "units";
    const usage = context.usageData?.[key];
    return typeof usage === "number" ? usage : 0;
  }

  private computeUsageCharge(context: BillingContext): number {
    const units = this.getUsageUnits(context);
    const freeUnits = this.config.freeUnitsPerPeriod ?? 0;
    const tiers = this.config.usageTiers ?? [];
    let remaining = Math.max(0, units - freeUnits);
    let total = 0;
    for (let i = 0; i < tiers.length && remaining > 0; i++) {
      const prevUpTo = i === 0 ? 0 : tiers[i - 1].upTo;
      const tierCap = tiers[i].upTo - prevUpTo;
      const take = Math.min(remaining, tierCap);
      total += take * tiers[i].unitPrice;
      remaining -= take;
    }
    // If usage exceeds last tier, bill remainder at last tier price
    if (remaining > 0 && tiers.length > 0) {
      total += remaining * tiers[tiers.length - 1].unitPrice;
    }
    return round2(total);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default DefaultBillingStrategy;