import { SubscriptionService as BDKSubscriptionService, SubscriptionCreateOptions, SubscriptionPauseOptions, SubscriptionCancelOptions, SubscriptionFilters } from '@mhbdev/bdk/services';
import { Subscription, Payment, BillingInterval, Money, SubscriptionStatus } from '@mhbdev/bdk/core';
import { db } from '@/db';
import { subscriptions, subscriptionPlans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { InvoiceService } from './invoice';
import { PaymentService } from './payment';
import { randomUUID } from 'crypto';
import { acquireLock, releaseLock } from '@/lib/redis';

// Use Node's crypto UUID for consistency
function uuid() { return randomUUID(); }

export class SubscriptionService extends BDKSubscriptionService {
  constructor(private paymentService: PaymentService, private invoiceService: InvoiceService ) { super(); }

  async create(customerId: string, planId: string, options?: SubscriptionCreateOptions): Promise<Subscription> {
    const planRows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1).execute();
    const plan = planRows[0];
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const now = new Date();
    const periodEnd = addInterval(now, plan.interval as BillingInterval, plan.intervalCount);
    const id = uuid();
    const inserted = await db
      .insert(subscriptions)
      .values({
        id,
        userId: customerId,
        planId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        createdAt: now,
        updatedAt: now,
        trialStart: options?.trialPeriodDays ? now : null,
        trialEnd: options?.trialPeriodDays ? addDays(now, options.trialPeriodDays) : null,
        metadata: options?.metadata || null,
        canceledAt: null
      })
      .returning()
      .execute();
    const s = inserted[0];
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async update(subscriptionId: string, updates: Partial<Subscription>): Promise<Subscription> {
    const now = new Date();
    const rows = await db
      .update(subscriptions)
      .set({ ...mapSubUpdate(updates), updatedAt: now })
      .where(eq(subscriptions.id, subscriptionId))
      .returning()
      .execute();
    const s = rows[0];
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async cancel(subscriptionId: string, options?: SubscriptionCancelOptions): Promise<Subscription> {
    const now = new Date();
    const rows = await db
      .update(subscriptions)
      .set({ status: SubscriptionStatus.CANCELED, canceledAt: now, updatedAt: now })
      .where(eq(subscriptions.id, subscriptionId))
      .returning()
      .execute();
    const s = rows[0];
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async pause(subscriptionId: string, options?: SubscriptionPauseOptions): Promise<Subscription> {
    const rows = await db
      .update(subscriptions)
      .set({ status: SubscriptionStatus.PAUSED, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning()
      .execute();
    const s = rows[0];
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async resume(subscriptionId: string): Promise<Subscription> {
    const rows = await db
      .update(subscriptions)
      .set({ status: SubscriptionStatus.ACTIVE, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning()
      .execute();
    const s = rows[0];
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async getById(subscriptionId: string): Promise<Subscription | null> {
    const sRows = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1).execute();
    const s = sRows[0];
    if (!s) return null;
    return {
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    };
  }

  async listByCustomer(customerId: string, filters?: SubscriptionFilters): Promise<Subscription[]> {
    const list = await db.select().from(subscriptions).where(eq(subscriptions.userId, customerId)).execute();
    return list.map((s) => ({
      id: s.id,
      customerId: s.userId,
      planId: s.planId,
      status: s.status as SubscriptionStatus,
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : undefined,
      trialStart: s.trialStart ? new Date(s.trialStart) : undefined,
      trialEnd: s.trialEnd ? new Date(s.trialEnd) : undefined,
      metadata: s.metadata || undefined,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt)
    }));
  }

  async processRenewal(subscriptionId: string): Promise<Payment> {
    const s = await this.getById(subscriptionId);
    if (!s) throw new Error(`Subscription not found: ${subscriptionId}`);
    // Acquire a short-lived distributed lock to prevent concurrent renewals
    const lockKey = `lock:subscription:renew:${subscriptionId}`;
    const lockVal = randomUUID();
    const gotLock = await acquireLock(lockKey, lockVal, 30);
    if (!gotLock) {
      throw new Error('Renewal already in progress');
    }
    const planRows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, s.planId)).limit(1).execute();
    const plan = planRows[0];
    if (!plan) throw new Error(`Plan not found: ${s.planId}`);
    const amount: Money = { amount: Number(plan.amount), currency: plan.currency };
    // For demo, assume a default payment method exists with id `pm_default_<customerId>`
    const pmId = `pm_default_${s.customerId}`;
    try {
      const idemKey = `renewal:${subscriptionId}:${Number(plan.amount)}:${new Date(s.currentPeriodEnd).toISOString()}`;
      return this.paymentService.process(
        s.customerId,
        amount,
        pmId,
        { subscriptionId, description: `Renewal for ${plan.name}`, metadata: { subscriptionId, idempotencyKey: idemKey } }
      );
    } finally {
      await releaseLock(lockKey);
    }
  }
}

function mapSubUpdate(updates: Partial<Subscription>) {
  const out: any = {};
  if (updates.status) out.status = updates.status;
  if (updates.currentPeriodStart) out.currentPeriodStart = updates.currentPeriodStart;
  if (updates.currentPeriodEnd) out.currentPeriodEnd = updates.currentPeriodEnd;
  if (updates.canceledAt) out.canceledAt = updates.canceledAt;
  if (updates.trialStart) out.trialStart = updates.trialStart;
  if (updates.trialEnd) out.trialEnd = updates.trialEnd;
  if (updates.metadata) out.metadata = updates.metadata;
  return out;
}

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addInterval(d: Date, interval: BillingInterval, count: number) {
  const x = new Date(d);
  switch (interval) {
    case BillingInterval.DAILY: x.setDate(x.getDate() + count); break;
    case BillingInterval.WEEKLY: x.setDate(x.getDate() + 7 * count); break;
    case BillingInterval.MONTHLY: x.setMonth(x.getMonth() + count); break;
    case BillingInterval.QUARTERLY: x.setMonth(x.getMonth() + 3 * count); break;
    case BillingInterval.YEARLY: x.setFullYear(x.getFullYear() + count); break;
  }
  return x;
}
