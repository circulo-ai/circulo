import { db, invoices } from "@/db";
import {
  type PlanFeatures,
  subscriptionHistory,
  subscriptionPlans,
  subscriptions,
} from "@/db/schema/billing";
import { and, eq } from "drizzle-orm";
import { getProvider } from ".";
import { BillingManager } from "./billing-manager";

export class SubscriptionManager {
  /**
   * Create a pending invoice for a new subscription
   * Subscription will be created after payment
   */
  static async createSubscriptionInvoice(
    userId: string,
    planSlug: string,
    provider: "changelly" = "changelly",
  ) {
    // Get plan
    const plan = await db.query.subscriptionPlans.findFirst({
      where: and(
        eq(subscriptionPlans.slug, planSlug),
        eq(subscriptionPlans.isActive, true),
      ),
    });

    if (!plan) {
      throw new Error(`Plan "${planSlug}" not found or inactive`);
    }

    // Check for existing active subscription
    const existing = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
    });

    if (existing) {
      throw new Error("User already has an active subscription");
    }

    // Free plan - create subscription immediately
    if (parseFloat(plan.usdPrice) === 0) {
      return await this.createFreeSubscription(userId, plan.id);
    }

    // Paid plan - create invoice WITHOUT subscription
    const billingManager = new BillingManager(getProvider(provider));
    return await billingManager.createInvoice({
      userId,
      subscriptionId: undefined, // NO subscription yet!
      type: "subscription",
      usdAmount: plan.usdPrice,
      description: `${plan.name} Subscription`,
      metadata: {
        planId: plan.id,
        planSlug: plan.slug,
        isNewSubscription: true, // Flag for webhook handler
      },
      lineItems: [
        {
          description: `${plan.name} Plan`,
          quantity: 1,
          unitPrice: plan.usdPrice,
          referenceType: "plan",
          referenceId: plan.id,
        },
      ],
    });
  }

  /**
   * Create free subscription immediately (no payment needed)
   */
  private static async createFreeSubscription(userId: string, planId: number) {
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new Error("Plan not found");
    }

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        status: "active",
        startDate: new Date(),
        endDate: new Date(
          Date.now() + plan.billingIntervalDays * 24 * 60 * 60 * 1000,
        ),
        autoRenew: true,
      })
      .returning();

    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: plan.id,
      oldStatus: null,
      newStatus: "active",
      reason: "free_plan_activated",
      changedAt: new Date(),
    });

    return { subscription, invoice: null };
  }

  /**
   * Called by BillingManager after payment confirmed
   * Creates the actual subscription
   */
  static async activateNewSubscription(
    userId: string,
    planId: number,
    invoiceId: number,
  ) {
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new Error("Plan not found");
    }

    // Create the subscription NOW
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        status: "active",
        startDate: new Date(),
        endDate: new Date(
          Date.now() + plan.billingIntervalDays * 24 * 60 * 60 * 1000,
        ),
        autoRenew: true,
      })
      .returning();

    // Link invoice to subscription
    await db
      .update(invoices)
      .set({ subscriptionId: subscription.id })
      .where(eq(invoices.id, invoiceId));

    // Record history
    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: plan.id,
      oldStatus: null,
      newStatus: "active",
      reason: "subscription_created",
      changedAt: new Date(),
    });

    return subscription;
  }

  /**
   * Request a plan change.
   * - If Upgrade: Creates an invoice. DOES NOT update subscription yet.
   * - If Free/Downgrade: Updates immediately (depending on your business logic).
   */
  static async changePlan(
    userId: string,
    newPlanSlug: string,
    provider: "changelly" = "changelly",
  ) {
    const subscription = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
      with: { plan: true },
    });

    if (!subscription) throw new Error("No active subscription found");

    const newPlan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.slug, newPlanSlug),
    });

    if (!newPlan || !newPlan.isActive) {
      throw new Error(`Plan "${newPlanSlug}" not found or inactive`);
    }

    const isUpgrade =
      parseFloat(newPlan.usdPrice) > parseFloat(subscription.plan.usdPrice);

    // 1. Handle Paid Upgrade (Invoice First Flow)
    if (isUpgrade && parseFloat(newPlan.usdPrice) > 0) {
      const billingManager = new BillingManager(getProvider(provider));

      // Calculate proration
      let amount = parseFloat(newPlan.usdPrice);
      if (subscription.endDate) {
        const remainingDays = Math.ceil(
          (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        const totalDays = newPlan.billingIntervalDays;
        if (remainingDays > 0) {
          amount = (amount * remainingDays) / totalDays;
        }
      }

      // Create Invoice ONLY - Do not touch subscription table yet
      const invoice = await billingManager.createInvoice({
        userId,
        subscriptionId: subscription.id,
        type: "subscription",
        usdAmount: amount.toFixed(2),
        description: `Upgrade to ${newPlan.name}`,
        metadata: {
          type: "plan_change", // Key flag for webhook
          isUpgrade: true,
          oldPlanId: subscription.planId,
          newPlanId: newPlan.id,
          subscriptionId: subscription.id,
        },
        lineItems: [
          {
            description: `${newPlan.name} Upgrade (Prorated)`,
            quantity: 1,
            unitPrice: amount.toFixed(2),
            referenceType: "plan",
            referenceId: newPlan.id,
          },
        ],
      });

      return { subscription, invoice };
    }

    // 2. Handle Free Plan / Downgrade (Immediate Flow)
    // Usually downgrades happen at end-of-cycle, but for immediate:

    await db
      .update(subscriptions)
      .set({
        planId: newPlan.id,
        // Keep active if moving to free, otherwise logic depends on your needs
        status: "active",
      })
      .where(eq(subscriptions.id, subscription.id));

    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: newPlan.id,
      oldStatus: subscription.status,
      newStatus: "active",
      reason: "plan_changed_immediate",
      metadata: {
        oldPlanId: subscription.planId,
        newPlanName: newPlan.name,
      },
      changedAt: new Date(),
    });

    return { subscription, invoice: null };
  }

  /**
   * Called by BillingManager webhook after payment
   */
  static async finalizePlanChange(
    subscriptionId: number,
    newPlanId: number,
    invoiceId: number,
  ) {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!subscription) throw new Error("Subscription not found");

    // Apply the change
    await db
      .update(subscriptions)
      .set({
        planId: newPlanId,
        status: "active",
        // Optional: Reset billing cycle or keep existing endDate?
        // Usually for upgrades, we keep the endDate but switch features.
      })
      .where(eq(subscriptions.id, subscriptionId));

    // Update invoice
    await db
      .update(invoices)
      .set({ subscriptionId })
      .where(eq(invoices.id, invoiceId));

    // Log History
    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: newPlanId,
      oldStatus: subscription.status,
      newStatus: "active",
      reason: "upgrade_paid",
      changedAt: new Date(),
    });
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(
    userId: string,
    immediately = false,
  ): Promise<void> {
    const subscription = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
    });

    if (!subscription) {
      throw new Error("No active subscription found");
    }

    if (immediately) {
      // Cancel immediately
      await db
        .update(subscriptions)
        .set({
          status: "canceled",
          autoRenew: false,
          endDate: new Date(),
        })
        .where(eq(subscriptions.id, subscription.id));

      await db.insert(subscriptionHistory).values({
        subscriptionId: subscription.id,
        planId: subscription.planId,
        oldStatus: "active",
        newStatus: "canceled",
        reason: "canceled_immediately",
        changedAt: new Date(),
      });
    } else {
      // Cancel at end of period
      await db
        .update(subscriptions)
        .set({ autoRenew: false })
        .where(eq(subscriptions.id, subscription.id));

      await db.insert(subscriptionHistory).values({
        subscriptionId: subscription.id,
        planId: subscription.planId,
        oldStatus: subscription.status,
        newStatus: subscription.status,
        reason: "scheduled_cancellation",
        metadata: { cancelsAt: subscription.endDate },
        changedAt: new Date(),
      });
    }
  }

  /**
   * Reactivate canceled subscription
   */
  static async reactivateSubscription(userId: string): Promise<void> {
    const subscription = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "canceled"),
      ),
      with: { plan: true },
    });

    if (!subscription) {
      throw new Error("No canceled subscription found");
    }

    await db
      .update(subscriptions)
      .set({
        status: "active",
        autoRenew: true,
      })
      .where(eq(subscriptions.id, subscription.id));

    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: subscription.planId,
      oldStatus: "canceled",
      newStatus: "active",
      reason: "reactivated",
      changedAt: new Date(),
    });
  }

  /**
   * Get user's active subscription with features
   */
  static async getActiveSubscription(userId: string) {
    const subscription = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
      with: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    return {
      ...subscription,
      features: subscription.plan.features as PlanFeatures,
    };
  }
}
