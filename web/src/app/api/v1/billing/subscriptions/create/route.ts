import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { invoice, invoiceLineItem, subscription, subscriptionPlan } from "@/db/schema";
import { initializeSizPay } from "@/lib/sizpay/client";
import SizpayProvider from "@/lib/billing/providers/sizpay-provider";
import DrizzlePaymentService from "@/lib/billing/services/payment-service";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq, or, and } from "drizzle-orm";
import { z } from "zod";
import DefaultBillingStrategy from "@/lib/billing/strategies/default-strategy";
import type { Subscription as BdkSubscription, SubscriptionPlan as BdkPlan, BillingInterval as BdkInterval } from "@mhbdev/bdk";

const bodySchema = z.object({
  planId: z.string().min(1),
});

function addInterval(start: Date, interval: string, count: number): Date {
  const d = new Date(start);
  switch (interval) {
    case "day":
      d.setDate(d.getDate() + count);
      return d;
    case "week":
      d.setDate(d.getDate() + count * 7);
      return d;
    case "month":
      d.setMonth(d.getMonth() + count);
      return d;
    case "year":
      d.setFullYear(d.getFullYear() + count);
      return d;
    default:
      return d;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const plan = await db.query.subscriptionPlan.findFirst({ where: eq(subscriptionPlan.id, parsed.data.planId) });
    if (!plan || !plan.active) {
      return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
    }

    // Prevent duplicate active/trialing subscriptions for the same plan
    const existingSub = await db.query.subscription.findFirst({
      where: and(
        eq(subscription.userId, session.user.id),
        eq(subscription.planId, parsed.data.planId),
        or(
          eq(subscription.status, "active"),
          eq(subscription.status, "trialing"),
          eq(subscription.status, "past_due"),
        ),
      ),
    });
    if (existingSub) {
      return NextResponse.json({ error: "Subscription already exists for this plan" }, { status: 409 });
    }

    const now = new Date();
    const periodStart = now;
    const periodEnd = addInterval(now, plan.interval, plan.intervalCount);

    const subId = nanoid();
    // Create subscription + invoice + line items atomically
    const invoiceId = nanoid();
    const invoiceNumber = `INV-${now.toISOString().slice(0,10).replace(/-/g,"")}-${invoiceId.slice(0,8)}`;

    await db.transaction(async (tx) => {
      await tx.insert(subscription).values({
        id: subId,
        userId: session.user.id,
        planId: plan.id,
        status: plan.trialPeriodDays ? "trialing" : "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialStart: plan.trialPeriodDays ? now : null,
        trialEnd: plan.trialPeriodDays ? addInterval(now, "day", plan.trialPeriodDays) : null,
        metadata: plan.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      });

      // Strategy and totals will be computed below; we set invoice after computing
      // But we can prepare invoice shell here if needed
    });

    // Build BDK entities and strategy
    const toBdkInterval = (i: string): BdkInterval => {
      switch (i) {
        case "day":
          return "daily" as BdkInterval;
        case "week":
          return "weekly" as BdkInterval;
        case "month":
          return "monthly" as BdkInterval;
        case "quarter":
          return "quarterly" as BdkInterval;
        case "year":
          return "yearly" as BdkInterval;
        default:
          return "monthly" as BdkInterval;
      }
    };

    const planFeatures = (plan.features ?? {}) as Record<string, any>;
    const planMetadata = (plan.metadata ?? {}) as Record<string, any> & { usageConfig?: any };

    const bdkPlan: BdkPlan = {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? undefined,
      price: { amount: Number(plan.amount), currency: plan.currency },
      interval: toBdkInterval(plan.interval),
      intervalCount: plan.intervalCount,
      trialPeriodDays: plan.trialPeriodDays ?? undefined,
      features: planFeatures,
      metadata: planMetadata,
      createdAt: now,
      updatedAt: now,
    };
    const bdkSub: BdkSubscription = {
      id: subId,
      customerId: session.user.id,
      planId: plan.id,
      status: (plan.trialPeriodDays ? "trialing" : "active") as any,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialStart: plan.trialPeriodDays ? now : undefined,
      trialEnd: plan.trialPeriodDays ? addInterval(now, "day", plan.trialPeriodDays) : undefined,
      metadata: plan.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const strategy = new DefaultBillingStrategy(planMetadata.usageConfig ?? {});
    const context = { currentDate: now, periodStart, periodEnd, isProration: false, usageData: {} };
    const totalMoney = await strategy.calculateAmount(bdkSub, bdkPlan, context);
    const lineItems = await strategy.generateLineItems(bdkSub, bdkPlan, context);
    // Insert invoice + line items in a single transaction for consistency
    await db.transaction(async (tx) => {
      await tx.insert(invoice).values({
        id: invoiceId,
        userId: session.user.id,
        subscriptionId: subId,
        number: invoiceNumber,
        status: "open",
        subtotalAmount: String(totalMoney.amount.toFixed(2)),
        subtotalCurrency: totalMoney.currency,
        totalAmount: String(totalMoney.amount.toFixed(2)),
        totalCurrency: totalMoney.currency,
        dueDate: addInterval(now, "day", 1),
        metadata: { planId: plan.id, interval: plan.interval, intervalCount: plan.intervalCount },
        createdAt: now,
        updatedAt: now,
      });

      for (const li of lineItems) {
        await tx.insert(invoiceLineItem).values({
          id: nanoid(),
          invoiceId,
          description: li.description,
          quantity: li.quantity,
          unitAmount: String(li.unitAmount.amount.toFixed(2)),
          unitCurrency: li.unitAmount.currency,
          amount: String(li.amount.amount.toFixed(2)),
          currency: li.amount.currency,
          metadata: li.metadata ?? {},
          createdAt: now,
        });
      }
    });

    const sizpayClient = initializeSizPay({
      merchantId: process.env.SIZPAY_MERCHANT_ID!,
      terminalId: process.env.SIZPAY_TERMINAL_ID!,
      username: process.env.SIZPAY_USERNAME!,
      password: process.env.SIZPAY_PASSWORD!,
      signKey: process.env.SIZPAY_SIGN_KEY!,
    });
    const provider = new SizpayProvider(sizpayClient);
    const payments = new DrizzlePaymentService(provider);

    const baseUrl = new URL(req.url).origin;
    const callbackUrl = `${baseUrl}/api/v1/billing/payments/callback`;

    // Initialize payment via provider and persist payment
    let paymentResp;
    try {
      paymentResp = await payments.process(
        session.user.id,
        { amount: totalMoney.amount, currency: totalMoney.currency },
        "sizpay_redirect",
        {
          description: `Subscription ${plan.name}`,
          metadata: { invoiceId, subscriptionId: subId, callbackUrl },
        },
      );
    } catch (err) {
      // If payment creation fails, mark invoice/subscription accordingly
      await db.transaction(async (tx) => {
        await tx.update(invoice).set({ status: "void", updatedAt: new Date() }).where(eq(invoice.id, invoiceId));
        await tx.update(subscription).set({ status: "cancelled", updatedAt: new Date(), canceledAt: new Date() }).where(eq(subscription.id, subId));
      });
      throw err;
    }

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subId,
        invoiceId,
        paymentId: paymentResp.id,
        gatewayUrl: paymentResp.metadata?.gatewayUrl,
      },
    });
  } catch (error) {
    console.error("Create subscription error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}