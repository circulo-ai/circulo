import { db } from "@/db";
import {
  subscriptionHistory,
  subscriptionPlans,
  subscriptions,
  type PlanFeatures,
} from "@/db/schema/billing";
import { and, eq } from "drizzle-orm";
import { getProvider } from ".";
import { BillingManager } from "./billing-manager";

export class SubscriptionManager {
  /**
   * Create a new subscription for a user
   */
  static async createSubscription(
    userId: string,
    planSlug: string,
    provider: "changelly" = "changelly",
  ) {
    // Get plan
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.slug, planSlug),
    });

    if (!plan || !plan.isActive) {
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

    // Create subscription
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        status: "inactive",
        autoRenew: true,
      })
      .returning();

    if (!subscription) {
      return { subscription: undefined, invoice: null };
    }

    // Record history
    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: plan.id,
      oldStatus: null,
      newStatus: "inactive",
      reason: "subscription_created",
      changedAt: new Date(),
    });

    // Create invoice if not free plan
    if (parseFloat(plan.usdPrice) > 0) {
      const billingManager = new BillingManager(getProvider(provider));
      const invoice = await billingManager.createSubscriptionInvoice(
        userId,
        subscription.id,
        plan.id,
      );

      return {
        subscription,
        invoice,
      };
    }

    // Free plan - activate immediately
    await db
      .update(subscriptions)
      .set({
        status: "active",
        startDate: new Date(),
        endDate: new Date(
          Date.now() + plan.billingIntervalDays * 24 * 60 * 60 * 1000,
        ),
      })
      .where(eq(subscriptions.id, subscription.id));

    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: plan.id,
      oldStatus: "inactive",
      newStatus: "active",
      reason: "free_plan_activated",
      changedAt: new Date(),
    });

    return { subscription, invoice: null };
  }

  /**
   * Upgrade/downgrade subscription
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

    if (!subscription) {
      throw new Error("No active subscription found");
    }

    const newPlan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.slug, newPlanSlug),
    });

    if (!newPlan || !newPlan.isActive) {
      throw new Error(`Plan "${newPlanSlug}" not found or inactive`);
    }

    const isUpgrade =
      parseFloat(newPlan.usdPrice) > parseFloat(subscription.plan.usdPrice);
    const isDowngrade =
      parseFloat(newPlan.usdPrice) < parseFloat(subscription.plan.usdPrice);

    // Update subscription
    await db
      .update(subscriptions)
      .set({
        planId: newPlan.id,
        status: parseFloat(newPlan.usdPrice) === 0 ? "active" : "inactive",
      })
      .where(eq(subscriptions.id, subscription.id));

    // Record history
    await db.insert(subscriptionHistory).values({
      subscriptionId: subscription.id,
      planId: newPlan.id,
      oldStatus: subscription.status,
      newStatus: parseFloat(newPlan.usdPrice) === 0 ? "active" : "inactive",
      reason: isUpgrade
        ? "upgraded"
        : isDowngrade
          ? "downgraded"
          : "plan_changed",
      metadata: {
        oldPlanId: subscription.planId,
        oldPlanName: subscription.plan.name,
        newPlanName: newPlan.name,
      },
      changedAt: new Date(),
    });

    // Create invoice for paid plans
    if (parseFloat(newPlan.usdPrice) > 0) {
      const billingManager = new BillingManager(getProvider(provider));

      // Calculate prorated amount if upgrading mid-cycle
      let amount = newPlan.usdPrice;
      if (isUpgrade && subscription.endDate) {
        const remainingDays = Math.ceil(
          (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        const totalDays = newPlan.billingIntervalDays;
        const proratedAmount =
          (parseFloat(newPlan.usdPrice) * remainingDays) / totalDays;
        amount = proratedAmount.toFixed(2);
      }

      const invoice = await billingManager.createInvoice({
        userId,
        subscriptionId: subscription.id,
        type: "subscription",
        usdAmount: amount,
        description: `${isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Change"} to ${newPlan.name}`,
        metadata: {
          planChange: true,
          oldPlanId: subscription.planId,
          newPlanId: newPlan.id,
          prorated: isUpgrade,
        },
        lineItems: [
          {
            description: `${newPlan.name} Plan${isUpgrade ? " (Prorated)" : ""}`,
            quantity: 1,
            unitPrice: amount,
            referenceType: "plan",
            referenceId: newPlan.id,
          },
        ],
      });

      return { subscription, invoice };
    }

    return { subscription, invoice: null };
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
