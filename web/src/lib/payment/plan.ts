import { PlanService as BDKPlanService, PlanFilters, PlanChangeCalculation } from '@mhbdev/bdk/services';
import { SubscriptionPlan, BillingInterval, Money } from '@mhbdev/bdk/core';
import { db } from '@/db';
import { subscriptionPlans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { PaymentService } from "@/lib/payment/payment";
import { InvoiceService } from "@/lib/payment/invoice";
import { SubscriptionService } from "@mhbdev/bdk";
import { randomUUID } from 'crypto';

function uuid() { return randomUUID(); }

export class PlanService extends BDKPlanService {
  constructor(private subscriptionservice: SubscriptionService ) { super(); }

  async create(plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubscriptionPlan> {
    const id = uuid();
    const now = new Date();
    const rows = await db
      .insert(subscriptionPlans)
      .values({
        id,
        name: plan.name,
        description: plan.description || null,
        amount: String(plan.price.amount),
        currency: plan.price.currency,
        interval: plan.interval,
        intervalCount: plan.intervalCount,
        trialPeriodDays: plan.trialPeriodDays || null,
        features: plan.features || {},
        metadata: plan.metadata || null,
        active: true,
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .execute();
    const p = rows[0];
    return {
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      price: { amount: Number(p.amount), currency: p.currency },
      interval: p.interval as BillingInterval,
      intervalCount: p.intervalCount,
      trialPeriodDays: p.trialPeriodDays || undefined,
      features: p.features,
      metadata: p.metadata || undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    };
  }

  async update(planId: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const now = new Date();
    const rows = await db
      .update(subscriptionPlans)
      .set(mapPlanUpdate(updates, now))
      .where(eq(subscriptionPlans.id, planId))
      .returning()
      .execute();
    const p = rows[0];
    return {
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      price: { amount: Number(p.amount), currency: p.currency },
      interval: p.interval as BillingInterval,
      intervalCount: p.intervalCount,
      trialPeriodDays: p.trialPeriodDays || undefined,
      features: p.features,
      metadata: p.metadata || undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    };
  }

  async archive(planId: string): Promise<void> {
    await db.update(subscriptionPlans).set({ active: false, updatedAt: new Date() }).where(eq(subscriptionPlans.id, planId)).execute();
  }

  async getById(planId: string): Promise<SubscriptionPlan | null> {
    const pRows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1).execute();
    const p = pRows[0];
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      price: { amount: Number(p.amount), currency: p.currency },
      interval: p.interval as BillingInterval,
      intervalCount: p.intervalCount,
      trialPeriodDays: p.trialPeriodDays || undefined,
      features: p.features,
      metadata: p.metadata || undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    };
  }

  async listActive(filters?: PlanFilters): Promise<SubscriptionPlan[]> {
    const list = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true)).execute();
    return list.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      price: { amount: Number(p.amount), currency: p.currency },
      interval: p.interval as BillingInterval,
      intervalCount: p.intervalCount,
      trialPeriodDays: p.trialPeriodDays || undefined,
      features: p.features,
      metadata: p.metadata || undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    }));
  }

  async canDowngrade(fromPlanId: string, toPlanId: string): Promise<boolean> { return true; }

  async calculatePlanChange(subscriptionId: string, newPlanId: string): Promise<PlanChangeCalculation> {
    // Fetch subscription (you may need to replace this with your own logic)
    const subscription = await this.subscriptionservice.getById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    const oldPlan = await this.getById(subscription.id);
    const newPlan = await this.getById(newPlanId);
    if (!oldPlan || !newPlan) throw new Error('Plan not found');

    const now = new Date();
    const periodStart = new Date(subscription.currentPeriodStart);
    const periodEnd = new Date(subscription.currentPeriodEnd);

    // Calculate how much of the current period remains
    const totalMs = periodEnd.getTime() - periodStart.getTime();
    const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
    const remainingFraction = remainingMs / totalMs;

    // Compute prorated amounts
    const proratedCredit = oldPlan.price.amount * remainingFraction;
    const proratedCharge = newPlan.price.amount * remainingFraction;
    const netAmount = proratedCharge - proratedCredit;

    return {
      proratedCredit: money(proratedCredit, newPlan.price.currency),
      proratedCharge: money(proratedCharge, newPlan.price.currency),
      netAmount: money(netAmount, newPlan.price.currency),
      effectiveDate: now,
      nextBillingDate: periodEnd
    };
  }

}

function money(amount: number, currency: string): Money { return { amount, currency }; }
function mapPlanUpdate(updates: Partial<SubscriptionPlan>, now: Date) {
  const out: any = { updatedAt: now };
  if (updates.name) out.name = updates.name;
  if (updates.description !== undefined) out.description = updates.description;
  if (updates.price) { out.amount = String(updates.price.amount); out.currency = updates.price.currency; }
  if (updates.interval) out.interval = updates.interval;
  if (updates.intervalCount) out.intervalCount = updates.intervalCount;
  if (updates.trialPeriodDays !== undefined) out.trialPeriodDays = updates.trialPeriodDays;
  if (updates.features) out.features = updates.features;
  if (updates.metadata) out.metadata = updates.metadata;
  return out;
}