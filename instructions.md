# AI Agent Prompt: Billing & Metering System for Circulo

## Project Overview
Implement a complete billing and usage metering system for Circulo (Next.js app) that manages subscriptions, usage tracking, and multiple payment gateways internally. Payment providers (Stripe, PayPal, etc.) act only as payment gateways - all billing logic is handled by our system.

## Tech Stack
- **Database**: PostgreSQL + Drizzle ORM
- **Cache**: Redis (ioredis) - already implemented
- **Cron Jobs**: Vercel Cron
- **Currency**: USD only
- **Payment Gateways**: Stripe, PayPal (others can be added later)
- **No Refunds**: Not supported in initial version

---

## Core Principles

1. **Provider-Agnostic**: All billing logic lives in our system. Payment providers only process transactions.
2. **Internal Ledger**: Track all credits, usage, and balances in our database
3. **Quota Enforcement**: Check limits before allowing actions
4. **Metered Billing**: Track usage events → aggregate → generate invoices
5. **Idempotent Operations**: Use transaction IDs to prevent duplicates

---

## Database Schema (Drizzle)

Create `db/schema/billing.ts`:

```typescript
import { pgTable, varchar, decimal, timestamp, boolean, integer, jsonb, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Subscription Plans
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 50 }).notNull(), // 'free', 'basic', 'pro', 'enterprise'
  displayName: varchar('display_name', { length: 100 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  billingPeriod: varchar('billing_period', { length: 20 }).notNull(), // 'monthly', 'annual'
  quotas: jsonb('quotas').notNull(), // {tokensPerMonth: 100000, apiCallsPerMonth: 1000, ...}
  features: jsonb('features').notNull(), // Feature flags
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  planId: varchar('plan_id', { length: 36 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'active', 'canceled', 'expired', 'trialing'
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  trialEndsAt: timestamp('trial_ends_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
  statusIdx: index('subscriptions_status_idx').on(table.status),
}));

// Credit Balance (Wallet)
export const creditBalances = pgTable('credit_balances', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().unique(),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Credit Transactions (Ledger)
export const creditTransactions = pgTable('credit_transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(), // Positive = credit, Negative = debit
  type: varchar('type', { length: 30 }).notNull(), // 'deposit', 'usage', 'subscription_payment', 'marketplace_purchase', 'marketplace_sale', 'bonus'
  description: varchar('description', { length: 255 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
  metadata: jsonb('metadata'), // {paymentGateway, transactionId, itemId, etc}
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(), // Prevent duplicates
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdCreatedAtIdx: index('credit_transactions_user_created_idx').on(table.userId, table.createdAt),
  idempotencyIdx: uniqueIndex('credit_transactions_idempotency_idx').on(table.idempotencyKey),
}));

// Usage Events (Raw Metering Data)
export const usageEvents = pgTable('usage_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'token_usage', 'api_call', 'roundtable_session', 'chatbot_message', 'storage'
  resourceType: varchar('resource_type', { length: 50 }), // 'gpt-4', 'claude-3', 'agent-execution'
  quantity: integer('quantity').notNull(), // tokens, count, duration in seconds
  metadata: jsonb('metadata'), // {modelName, agentId, sessionId, etc}
  billingCycle: varchar('billing_cycle', { length: 7 }), // '2025-11' format
  billed: boolean('billed').default(false).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  userTimestampIdx: index('usage_events_user_timestamp_idx').on(table.userId, table.timestamp),
  billingCycleIdx: index('usage_events_billing_cycle_idx').on(table.billingCycle, table.billed),
  eventTypeIdx: index('usage_events_event_type_idx').on(table.eventType),
}));

// Usage Aggregates (Rolled-up for Performance)
export const usageAggregates = pgTable('usage_aggregates', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  billingCycle: varchar('billing_cycle', { length: 7 }).notNull(), // '2025-11'
  eventType: varchar('event_type', { length: 50 }).notNull(),
  totalQuantity: bigint('total_quantity', { mode: 'number' }).default(0).notNull(),
  totalCost: decimal('total_cost', { precision: 10, scale: 4 }).default('0').notNull(),
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
}, (table) => ({
  uniqueAggregate: uniqueIndex('usage_aggregates_unique_idx').on(table.userId, table.billingCycle, table.eventType),
  billingCycleIdx: index('usage_aggregates_billing_cycle_idx').on(table.billingCycle),
}));

// Invoices
export const invoices = pgTable('invoices', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
  billingCycle: varchar('billing_cycle', { length: 7 }).notNull(), // '2025-11'
  subscriptionFee: decimal('subscription_fee', { precision: 10, scale: 2 }).default('0').notNull(),
  usageFees: decimal('usage_fees', { precision: 10, scale: 2 }).default('0').notNull(),
  marketplaceFees: decimal('marketplace_fees', { precision: 10, scale: 2 }).default('0').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'draft', 'pending', 'paid', 'void'
  paidAt: timestamp('paid_at'),
  dueDate: timestamp('due_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userBillingCycleIdx: index('invoices_user_billing_cycle_idx').on(table.userId, table.billingCycle),
  invoiceNumberIdx: uniqueIndex('invoices_invoice_number_idx').on(table.invoiceNumber),
}));

// Invoice Line Items
export const invoiceLineItems = pgTable('invoice_line_items', {
  id: varchar('id', { length: 36 }).primaryKey(),
  invoiceId: varchar('invoice_id', { length: 36 }).notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 4 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  metadata: jsonb('metadata'),
}, (table) => ({
  invoiceIdIdx: index('invoice_line_items_invoice_id_idx').on(table.invoiceId),
}));

// Marketplace Transactions
export const marketplaceTransactions = pgTable('marketplace_transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  buyerId: varchar('buyer_id', { length: 36 }).notNull(),
  sellerId: varchar('seller_id', { length: 36 }).notNull(),
  itemType: varchar('item_type', { length: 30 }).notNull(), // 'agent', 'knowledge_base'
  itemId: varchar('item_id', { length: 36 }).notNull(),
  grossAmount: decimal('gross_amount', { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 10, scale: 2 }).notNull(),
  sellerAmount: decimal('seller_amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'pending', 'completed', 'failed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  buyerIdIdx: index('marketplace_transactions_buyer_id_idx').on(table.buyerId),
  sellerIdIdx: index('marketplace_transactions_seller_id_idx').on(table.sellerId),
  statusIdx: index('marketplace_transactions_status_idx').on(table.status),
}));

// Payment Gateway Transactions (External payments)
export const paymentTransactions = pgTable('payment_transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  gateway: varchar('gateway', { length: 20 }).notNull(), // 'stripe', 'paypal'
  gatewayTransactionId: varchar('gateway_transaction_id', { length: 255 }).unique(),
  type: varchar('type', { length: 30 }).notNull(), // 'deposit', 'subscription_payment'
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'pending', 'completed', 'failed'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  userIdIdx: index('payment_transactions_user_id_idx').on(table.userId),
  gatewayTransactionIdIdx: uniqueIndex('payment_transactions_gateway_tx_idx').on(table.gatewayTransactionId),
}));
```

---

## Core Services

### 1. Usage Tracker Service
Create `lib/billing/usage-tracker.ts`:

```typescript
import { db } from '@/db';
import { usageEvents, usageAggregates } from '@/db/schema/billing';
import { redis } from '@/lib/redis';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

interface TrackUsageParams {
  userId: string;
  eventType: 'token_usage' | 'api_call' | 'roundtable_session' | 'chatbot_message' | 'storage';
  quantity: number;
  resourceType?: string;
  metadata?: Record<string, any>;
}

export class UsageTracker {
  async track(params: TrackUsageParams): Promise<void> {
    const billingCycle = new Date().toISOString().slice(0, 7); // '2025-11'

    // Insert usage event
    await db.insert(usageEvents).values({
      id: uuidv4(),
      userId: params.userId,
      eventType: params.eventType,
      resourceType: params.resourceType,
      quantity: params.quantity,
      metadata: params.metadata,
      billingCycle,
      billed: false,
      timestamp: new Date(),
    });

    // Invalidate cached usage for this user
    await redis.del(`usage:${params.userId}:${billingCycle}`);
  }

  async getCurrentUsage(userId: string, billingCycle: string): Promise<Record<string, number>> {
    // Check cache first
    const cached = await redis.get(`usage:${userId}:${billingCycle}`);
    if (cached) return JSON.parse(cached);

    // Query aggregates
    const aggregates = await db.select()
      .from(usageAggregates)
      .where(and(
        eq(usageAggregates.userId, userId),
        eq(usageAggregates.billingCycle, billingCycle)
      ));

    const usage = aggregates.reduce((acc, agg) => {
      acc[agg.eventType] = Number(agg.totalQuantity);
      return acc;
    }, {} as Record<string, number>);

    // Cache for 5 minutes
    await redis.setex(`usage:${userId}:${billingCycle}`, 300, JSON.stringify(usage));

    return usage;
  }

  // Cron job: Aggregate usage events hourly
  async aggregateUsage(billingCycle: string): Promise<void> {
    // This runs via Vercel Cron
    const unbilledEvents = await db.select()
      .from(usageEvents)
      .where(and(
        eq(usageEvents.billingCycle, billingCycle),
        eq(usageEvents.billed, false)
      ));

    // Group by userId and eventType
    const grouped = unbilledEvents.reduce((acc, event) => {
      const key = `${event.userId}:${event.eventType}`;
      if (!acc[key]) acc[key] = { userId: event.userId, eventType: event.eventType, total: 0 };
      acc[key].total += event.quantity;
      return acc;
    }, {} as Record<string, { userId: string; eventType: string; total: number }>);

    // Update or insert aggregates
    for (const [_, data] of Object.entries(grouped)) {
      await db.insert(usageAggregates)
        .values({
          id: uuidv4(),
          userId: data.userId,
          billingCycle,
          eventType: data.eventType,
          totalQuantity: data.total,
          totalCost: 0, // Calculate based on pricing
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [usageAggregates.userId, usageAggregates.billingCycle, usageAggregates.eventType],
          set: {
            totalQuantity: data.total,
            lastUpdated: new Date(),
          },
        });
    }

    // Mark events as billed
    await db.update(usageEvents)
      .set({ billed: true })
      .where(and(
        eq(usageEvents.billingCycle, billingCycle),
        eq(usageEvents.billed, false)
      ));
  }
}

export const usageTracker = new UsageTracker();
```

### 2. Quota Manager Service
Create `lib/billing/quota-manager.ts`:

```typescript
import { db } from '@/db';
import { subscriptions, subscriptionPlans } from '@/db/schema/billing';
import { redis } from '@/lib/redis';
import { usageTracker } from './usage-tracker';
import { eq } from 'drizzle-orm';

interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

export class QuotaManager {
  async enforceQuota(userId: string, eventType: string, quantity: number = 1): Promise<QuotaCheck> {
    // Get user's subscription plan
    const sub = await this.getSubscriptionWithPlan(userId);
    if (!sub) return { allowed: false, reason: 'No active subscription' };

    const quotas = sub.plan.quotas as Record<string, number>;
    const quotaKey = this.getQuotaKey(eventType);
    const limit = quotas[quotaKey];

    if (!limit) return { allowed: true }; // No limit for this event type

    // Get current usage
    const billingCycle = new Date().toISOString().slice(0, 7);
    const usage = await usageTracker.getCurrentUsage(userId, billingCycle);
    const currentUsage = usage[eventType] || 0;

    const remaining = limit - currentUsage;

    if (currentUsage + quantity > limit) {
      return {
        allowed: false,
        reason: `Quota exceeded for ${eventType}. Limit: ${limit}, Current: ${currentUsage}`,
        remaining: Math.max(0, remaining),
      };
    }

    return { allowed: true, remaining };
  }

  async getRemainingQuota(userId: string): Promise<Record<string, number>> {
    const sub = await this.getSubscriptionWithPlan(userId);
    if (!sub) return {};

    const quotas = sub.plan.quotas as Record<string, number>;
    const billingCycle = new Date().toISOString().slice(0, 7);
    const usage = await usageTracker.getCurrentUsage(userId, billingCycle);

    return Object.entries(quotas).reduce((acc, [key, limit]) => {
      const eventType = this.getEventTypeFromQuotaKey(key);
      const used = usage[eventType] || 0;
      acc[key] = Math.max(0, limit - used);
      return acc;
    }, {} as Record<string, number>);
  }

  private async getSubscriptionWithPlan(userId: string) {
    // Cache for 5 minutes
    const cacheKey = `subscription:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [sub] = await db.select()
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active')
      ))
      .limit(1);

    if (sub) await redis.setex(cacheKey, 300, JSON.stringify(sub));
    return sub;
  }

  private getQuotaKey(eventType: string): string {
    const mapping: Record<string, string> = {
      'token_usage': 'tokensPerMonth',
      'api_call': 'apiCallsPerMonth',
      'roundtable_session': 'roundtablesPerDay',
      'chatbot_message': 'chatbotMessagesPerMonth',
    };
    return mapping[eventType] || eventType;
  }

  private getEventTypeFromQuotaKey(quotaKey: string): string {
    const mapping: Record<string, string> = {
      'tokensPerMonth': 'token_usage',
      'apiCallsPerMonth': 'api_call',
      'roundtablesPerDay': 'roundtable_session',
      'chatbotMessagesPerMonth': 'chatbot_message',
    };
    return mapping[quotaKey] || quotaKey;
  }
}

export const quotaManager = new QuotaManager();
```

### 3. Credit Ledger Service
Create `lib/billing/credit-ledger.ts`:

```typescript
import { db } from '@/db';
import { creditBalances, creditTransactions } from '@/db/schema/billing';
import { redis } from '@/lib/redis';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

interface TransactionParams {
  userId: string;
  amount: number; // Positive = credit, Negative = debit
  type: string;
  description: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export class CreditLedger {
  async addTransaction(params: TransactionParams): Promise<void> {
    // Check idempotency
    if (params.idempotencyKey) {
      const existing = await db.select()
        .from(creditTransactions)
        .where(eq(creditTransactions.idempotencyKey, params.idempotencyKey))
        .limit(1);

      if (existing.length > 0) return; // Already processed
    }

    // Get current balance
    const [balance] = await db.select()
      .from(creditBalances)
      .where(eq(creditBalances.userId, params.userId))
      .limit(1);

    const currentBalance = balance ? parseFloat(balance.balance) : 0;
    const newBalance = currentBalance + params.amount;

    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    // Use transaction for atomicity
    await db.transaction(async (tx) => {
      // Insert transaction record
      await tx.insert(creditTransactions).values({
        id: uuidv4(),
        userId: params.userId,
        amount: params.amount.toString(),
        type: params.type,
        description: params.description,
        balanceAfter: newBalance.toString(),
        metadata: params.metadata,
        idempotencyKey: params.idempotencyKey,
        createdAt: new Date(),
      });

      // Update balance
      if (balance) {
        await tx.update(creditBalances)
          .set({ balance: newBalance.toString(), updatedAt: new Date() })
          .where(eq(creditBalances.userId, params.userId));
      } else {
        await tx.insert(creditBalances).values({
          id: uuidv4(),
          userId: params.userId,
          balance: newBalance.toString(),
          currency: 'USD',
          updatedAt: new Date(),
        });
      }
    });

    // Invalidate cache
    await redis.del(`balance:${params.userId}`);
  }

  async getBalance(userId: string): Promise<number> {
    // Check cache
    const cached = await redis.get(`balance:${userId}`);
    if (cached) return parseFloat(cached);

    const [balance] = await db.select()
      .from(creditBalances)
      .where(eq(creditBalances.userId, userId))
      .limit(1);

    const amount = balance ? parseFloat(balance.balance) : 0;

    // Cache for 2 minutes
    await redis.setex(`balance:${userId}`, 120, amount.toString());

    return amount;
  }

  async deductForSubscription(userId: string, amount: number, planName: string): Promise<void> {
    await this.addTransaction({
      userId,
      amount: -amount,
      type: 'subscription_payment',
      description: `Subscription payment for ${planName}`,
      metadata: { planName },
    });
  }

  async deductForUsage(userId: string, amount: number, billingCycle: string): Promise<void> {
    await this.addTransaction({
      userId,
      amount: -amount,
      type: 'usage',
      description: `Usage charges for ${billingCycle}`,
      metadata: { billingCycle },
    });
  }
}

export const creditLedger = new CreditLedger();
```

### 4. Payment Gateway Service
Create `lib/billing/payment-gateway.ts`:

```typescript
import Stripe from 'stripe';
import { db } from '@/db';
import { paymentTransactions } from '@/db/schema/billing';
import { creditLedger } from './credit-ledger';
import { v4 as uuidv4 } from 'uuid';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-11-20.acacia' });

export class PaymentGateway {
  // Create deposit session (Stripe Checkout or PayPal)
  async createDepositSession(userId: string, amount: number, gateway: 'stripe' | 'paypal'): Promise<string> {
    const transactionId = uuidv4();

    if (gateway === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Credit Deposit' },
            unit_amount: Math.round(amount * 100), // cents
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL}/billing`,
        metadata: { userId, transactionId, type: 'deposit' },
      });

      // Record pending transaction
      await db.insert(paymentTransactions).values({
        id: transactionId,
        userId,
        gateway: 'stripe',
        gatewayTransactionId: session.id,
        type: 'deposit',
        amount: amount.toString(),
        currency: 'USD',
        status: 'pending',
        metadata: { sessionId: session.id },
        createdAt: new Date(),
      });

      return session.url!;
    }

    // Implement PayPal similarly
    throw new Error('PayPal not implemented yet');
  }

  // Webhook handler for Stripe
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, transactionId } = session.metadata!;

      // Update transaction status
      await db.update(paymentTransactions)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(paymentTransactions.id, transactionId));

      // Credit user's balance
      const amount = session.amount_total! / 100;
      await creditLedger.addTransaction({
        userId,
        amount,
        type: 'deposit',
        description: `Deposit via Stripe`,
        metadata: { gateway: 'stripe', sessionId: session.id },
        idempotencyKey: transactionId,
      });
    }
  }
}

export const paymentGateway = new PaymentGateway();
```

---

## API Routes

### Webhook Handler
Create `app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { paymentGateway } from '@/lib/billing/payment-gateway';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-11-20.acacia' });

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  try {
    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    await paymentGateway.handleStripeWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }
}
```

### Usage Tracking API
Create `app/api/usage/track/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { usageTracker } from '@/lib/billing/usage-tracker';
import { quotaManager } from '@/lib/billing/quota-manager';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventType, quantity, resourceType, metadata } = await req.json();

  // Check quota first
  const quotaCheck = await quotaManager.enforceQuota(user.id, eventType, quantity);
  if (!quotaCheck.allowed) {
    return NextResponse.json({ error: quotaCheck.reason }, { status: 403 });
  }

  // Track usage
  await usageTracker.track({
    userId: user.id,
    eventType,
    quantity,
    resourceType,
    metadata,
  });

  return NextResponse.json({ success: true, remaining: quotaCheck.remaining });
}
```

---

## Vercel Cron Jobs

Create `app/api/cron/aggregate-usage/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { usageTracker } from '@/lib/billing/usage-tracker';

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billingCycle = new Date().toISOString().slice(0, 7);
  await usageTracker.aggregateUsage(billingCycle);

  return NextResponse.json({ success: true });
}
```

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/aggregate-usage",
    "schedule": "0 * * * *"
  }]
}
```

---

## Integration Examples

### Wrap Billable Operations

#### Example 1: AI Agent Execution
```typescript
// lib/agents/execute-agent.ts
import { quotaManager } from '@/lib/billing/quota-manager';
import { usageTracker } from '@/lib/billing/usage-tracker';

export async function executeAgent(userId: string, agentId: string, prompt: string) {
  // Check quota before execution
  const quotaCheck = await quotaManager.enforceQuota(userId, 'api_call', 1);
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.reason);
  }

  // Execute agent
  const result = await aiService.run(agentId, prompt);

  // Track usage after execution
  await usageTracker.track({
    userId,
    eventType: 'token_usage',
    quantity: result.tokensUsed,
    resourceType: result.modelName,
    metadata: { agentId, promptLength: prompt.length }
  });

  await usageTracker.track({
    userId,
    eventType: 'api_call',
    quantity: 1,
    metadata: { agentId, action: 'execute' }
  });

  return result;
}
```

#### Example 2: Roundtable Session
```typescript
// lib/roundtable/create-session.ts
export async function createRoundtableSession(userId: string, agentIds: string[]) {
  const quotaCheck = await quotaManager.enforceQuota(userId, 'roundtable_session', 1);
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.reason);
  }

  const session = await db.insert(roundtableSessions).values({...});

  await usageTracker.track({
    userId,
    eventType: 'roundtable_session',
    quantity: 1,
    metadata: { sessionId: session.id, agentCount: agentIds.length }
  });

  return session;
}
```

#### Example 3: Marketplace Purchase
```typescript
// lib/marketplace/purchase.ts
import { creditLedger } from '@/lib/billing/credit-ledger';

export async function purchaseMarketplaceItem(buyerId: string, itemId: string, sellerId: string, price: number) {
  const balance = await creditLedger.getBalance(buyerId);
  if (balance < price) {
    throw new Error('Insufficient balance');
  }

  const platformFee = price * 0.20; // 20% commission
  const sellerAmount = price - platformFee;

  // Deduct from buyer
  await creditLedger.addTransaction({
    userId: buyerId,
    amount: -price,
    type: 'marketplace_purchase',
    description: `Purchased item ${itemId}`,
    metadata: { itemId, sellerId },
    idempotencyKey: `purchase-${itemId}-${buyerId}`,
  });

  // Credit seller
  await creditLedger.addTransaction({
    userId: sellerId,
    amount: sellerAmount,
    type: 'marketplace_sale',
    description: `Sold item ${itemId}`,
    metadata: { itemId, buyerId, platformFee },
    idempotencyKey: `sale-${itemId}-${sellerId}`,
  });

  // Record transaction
  await db.insert(marketplaceTransactions).values({
    id: uuidv4(),
    buyerId,
    sellerId,
    itemType: 'agent',
    itemId,
    grossAmount: price.toString(),
    platformFee: platformFee.toString(),
    sellerAmount: sellerAmount.toString(),
    status: 'completed',
    createdAt: new Date(),
  });
}
```

---

## Frontend Components

### Billing Dashboard
```typescript
// app/dashboard/billing/page.tsx
import { getCurrentUser } from '@/lib/auth';
import { quotaManager } from '@/lib/billing/quota-manager';
import { creditLedger } from '@/lib/billing/credit-ledger';

export default async function BillingPage() {
  const user = await getCurrentUser();
  const balance = await creditLedger.getBalance(user.id);
  const remaining = await quotaManager.getRemainingQuota(user.id);

  return (
    <div>
      <h1>Billing Dashboard</h1>

      {/* Credit Balance */}
      <div>
        <h2>Credit Balance</h2>
        <p>${balance.toFixed(2)} USD</p>
        <button>Add Credits</button>
      </div>

      {/* Usage Quotas */}
      <div>
        <h2>Monthly Usage</h2>
        {Object.entries(remaining).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <progress value={value} max={100} />
            <span>{value} remaining</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Quota Warning Component
```typescript
// components/billing/quota-warning.tsx
'use client';

export function QuotaWarning({ remaining, limit, type }: { remaining: number; limit: number; type: string }) {
  const percentage = (remaining / limit) * 100;

  if (percentage > 20) return null;

  return (
    <div className="bg-yellow-100 border border-yellow-400 p-4 rounded">
      <p>⚠️ You've used {100 - percentage}% of your {type} quota</p>
      <button>Upgrade Plan</button>
    </div>
  );
}
```

---

## Pricing Configuration

Create `lib/billing/pricing.ts`:

```typescript
export const PRICING_CONFIG = {
  plans: {
    free: {
      tokensPerMonth: 100000,
      apiCallsPerMonth: 1000,
      agentsLimit: 3,
      knowledgeBasesLimit: 2,
      roundtablesPerDay: 5,
      chatbotEmbeds: 0,
    },
    basic: {
      price: 19,
      tokensPerMonth: 1000000,
      apiCallsPerMonth: 10000,
      agentsLimit: 20,
      knowledgeBasesLimit: 10,
      roundtablesPerDay: 50,
      chatbotEmbeds: 1,
    },
    pro: {
      price: 49,
      tokensPerMonth: 5000000,
      apiCallsPerMonth: 100000,
      agentsLimit: 100,
      knowledgeBasesLimit: 50,
      roundtablesPerDay: 500,
      chatbotEmbeds: 5,
    },
  },

  overageRates: {
    tokens: 0.00002, // per token
    apiCalls: 0.01,  // per call
    chatbotMessages: 0.005,
  },

  marketplace: {
    platformFeePercent: 20,
    minimumPrice: 5.00,
  },
};
```

---

## Environment Variables

Add to `.env`:
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Cron Security
CRON_SECRET=your-random-secret

# App URL
NEXT_PUBLIC_URL=https://circulo.app
```

---

## Implementation Checklist

### Phase 1: Database Setup
- [ ] Create schema file with Drizzle
- [ ] Run migrations
- [ ] Seed subscription plans
- [ ] Test database connections

### Phase 2: Core Services
- [ ] Implement UsageTracker
- [ ] Implement QuotaManager with Redis caching
- [ ] Implement CreditLedger with transactions
- [ ] Implement PaymentGateway (Stripe)
- [ ] Test all services independently

### Phase 3: API Routes
- [ ] Create Stripe webhook handler
- [ ] Create usage tracking endpoint
- [ ] Create billing dashboard APIs
- [ ] Create deposit/payment endpoints
- [ ] Test with Stripe CLI

### Phase 4: Integration
- [ ] Wrap all AI agent executions
- [ ] Wrap roundtable sessions
- [ ] Wrap chatbot messages
- [ ] Wrap marketplace transactions
- [ ] Add quota checks to all entry points

### Phase 5: Cron Jobs
- [ ] Set up usage aggregation cron
- [ ] Configure vercel.json
- [ ] Test cron execution
- [ ] Monitor cron logs

### Phase 6: Frontend
- [ ] Build billing dashboard
- [ ] Create quota warning UI
- [ ] Add payment flow UI
- [ ] Build subscription management
- [ ] Create invoice display

### Phase 7: Testing
- [ ] Test quota enforcement
- [ ] Test usage tracking accuracy
- [ ] Test payment flows (Stripe test mode)
- [ ] Test marketplace transactions
- [ ] Load test with high usage volumes

### Phase 8: Monitoring
- [ ] Set up error tracking
- [ ] Monitor webhook success rates
- [ ] Track payment completion rates
- [ ] Monitor quota hit rates
- [ ] Alert on failed transactions

---

## Key Implementation Notes

1. **Idempotency**: Always use idempotency keys for credit transactions to prevent duplicate charges

2. **Atomicity**: Use database transactions when updating balances and ledgers together

3. **Caching Strategy**:
   - User balance: 2 min TTL
   - Subscription plan: 5 min TTL
   - Current usage: 5 min TTL (invalidate on new events)

4. **Quota Checks**: Always check quotas BEFORE performing the action, not after

5. **Usage Tracking**: Track usage AFTER the action completes successfully

6. **Error Handling**: If quota check passes but action fails, don't track usage

7. **Marketplace**: Platform takes 20% fee, credited to platform account (define platform userId)

8. **No Refunds**: System doesn't support refunds - handle manually if needed

---

## Success Criteria

✅ All billable actions have quota checks and usage tracking
✅ Credit balance updates are atomic and consistent
✅ Stripe webhooks process successfully (monitor 99%+ success rate)
✅ Cron jobs run hourly without failures
✅ Redis cache reduces database load for quota checks
✅ Users can deposit credits via Stripe
✅ Marketplace transactions split fees correctly
✅ Dashboard shows real-time usage and balance
✅ System handles 1000+ concurrent usage events

---

## Post-Implementation

After completing implementation:
1. Test in Stripe test mode thoroughly
2. Monitor Redis memory usage
3. Optimize slow database queries
4. Add analytics dashboard for revenue
5. Consider adding PayPal integration
6. Plan for invoice generation feature
7. Add usage export for users
