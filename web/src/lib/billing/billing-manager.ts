import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import {
  invoices,
  invoiceLineItems,
  subscriptions,
  subscriptionHistory,
  subscriptionPlans,
} from '@/db/schema/billing';
import { getProvider } from '.';
import { PaymentProvider } from './abstraction/payment-provider';
import { CreateInvoiceParams, InvoiceStatus } from './abstraction/types';

export class BillingManager {
  constructor(private readonly provider: PaymentProvider) {}

  /**
   * Create a new invoice
   */
  async createInvoice(params: CreateInvoiceParams) {
    // Create invoice with provider
    const providerInvoice = await this.provider.createInvoice(params);

    // Calculate total from line items if provided
    const totalAmount = params.lineItems?.length
      ? params.lineItems
          .reduce((sum, item) => {
            return sum + parseFloat(item.unitPrice) * item.quantity;
          }, 0)
          .toFixed(2)
      : params.usdAmount;

    // Insert invoice into database
    const [invoice] = await db
      .insert(invoices)
      .values({
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        type: params.type,
        provider: this.provider.name,
        providerInvoiceId: providerInvoice.invoiceId,
        usdAmount: totalAmount,
        status: 'pending',
        description: params.description,
        metadata: params.metadata,
        dueDate: params.dueDate,
        createdAt: new Date(),
      })
      .returning();

    // Insert line items if provided
    if (params.lineItems?.length && invoice) {
      const lineItemsData = params.lineItems.map((item) => ({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        metadata: item.metadata,
      }));

      await db.insert(invoiceLineItems).values(lineItemsData);
    }

    return {
      invoice,
      checkoutUrl: providerInvoice.checkoutUrl,
      expiresAt: providerInvoice.expiresAt,
    };
  }

  /**
   * Update invoice status from webhook or manual check
   */
  async updateInvoiceStatus(
    providerInvoiceId: string,
    newStatus: InvoiceStatus,
    paidAt?: Date
  ): Promise<void> {
    const now = new Date();

    // Update invoice
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        status: newStatus,
        paidAt: newStatus === 'paid' ? paidAt || now : undefined,
        failedAt: newStatus === 'failed' ? now : undefined,
      })
      .where(eq(invoices.providerInvoiceId, providerInvoiceId))
      .returning();

    if (!updatedInvoice) {
      throw new Error(`Invoice not found: ${providerInvoiceId}`);
    }

    // Handle subscription activation/renewal if applicable
    if (
      newStatus === 'paid' &&
      updatedInvoice.type === 'subscription' &&
      updatedInvoice.subscriptionId
    ) {
      await this.activateSubscription(updatedInvoice.subscriptionId);
    }

    // Handle failed payment
    if (newStatus === 'failed' && updatedInvoice.subscriptionId) {
      await this.handleFailedPayment(updatedInvoice.subscriptionId);
    }
  }

  /**
   * Activate or renew a subscription
   */
  private async activateSubscription(subscriptionId: number): Promise<void> {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
      with: { plan: true },
    });

    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    const now = new Date();
    const billingDays = subscription.plan.billingIntervalDays;
    const newEndDate = new Date(now.getTime() + billingDays * 24 * 60 * 60 * 1000);

    const oldStatus = subscription.status;

    // Update subscription
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        startDate: subscription.status === 'inactive' ? now : subscription.startDate,
        endDate: newEndDate,
      })
      .where(eq(subscriptions.id, subscriptionId));

    // Record history
    await db.insert(subscriptionHistory).values({
      subscriptionId,
      planId: subscription.planId,
      oldStatus,
      newStatus: 'active',
      reason: oldStatus === 'inactive' ? 'activated' : 'renewed',
      changedAt: now,
    });
  }

  /**
   * Handle failed payment
   */
  private async handleFailedPayment(subscriptionId: number): Promise<void> {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!subscription) return;

    // Mark subscription as inactive after 3 failed payments
    // (You could track retry count in metadata)
    await db
      .update(subscriptions)
      .set({ status: 'inactive' })
      .where(eq(subscriptions.id, subscriptionId));

    await db.insert(subscriptionHistory).values({
      subscriptionId,
      planId: subscription.planId,
      oldStatus: subscription.status,
      newStatus: 'inactive',
      reason: 'payment_failed',
      changedAt: new Date(),
    });
  }

  /**
   * Create subscription invoice
   */
  async createSubscriptionInvoice(
    userId: string,
    subscriptionId: number,
    planId: number
  ) {
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    return this.createInvoice({
      userId,
      subscriptionId,
      type: 'subscription',
      usdAmount: plan.usdPrice,
      description: `${plan.name} - Subscription`,
      lineItems: [
        {
          description: `${plan.name} Plan`,
          quantity: 1,
          unitPrice: plan.usdPrice,
          referenceType: 'plan',
          referenceId: planId,
        },
      ],
    });
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: unknown, signature: string): Promise<void> {
    // Verify webhook signature
    if (!this.provider.verifyWebhook(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    // Parse webhook event
    const event = this.provider.parseWebhook(payload);

    // Update invoice status
    await this.updateInvoiceStatus(
      event.invoiceId,
      event.status,
      event.paidAt
    );

    // Call provider-specific webhook handler if exists
    if (this.provider.handleWebhook) {
      await this.provider.handleWebhook(event);
    }
  }

  /**
   * Check and process expired subscriptions
   */
  static async processExpiredSubscriptions(): Promise<void> {
    const now = new Date();

    const expired = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.status, 'active'),
        lte(subscriptions.endDate, now)
      ),
    });

    for (const sub of expired) {
      if (sub.autoRenew) {
        // TODO: maybe we can handle autoRenew for free plans in here
        // Create renewal invoice
        const manager = new BillingManager(getProvider('stripe')); // Default provider
        await manager.createSubscriptionInvoice(
          sub.userId,
          sub.id,
          sub.planId
        );
      } else {
        // Mark as expired
        await db
          .update(subscriptions)
          .set({ status: 'expired' })
          .where(eq(subscriptions.id, sub.id));

        await db.insert(subscriptionHistory).values({
          subscriptionId: sub.id,
          planId: sub.planId,
          oldStatus: 'active',
          newStatus: 'expired',
          reason: 'subscription_ended',
          changedAt: now,
        });
      }
    }
  }
}
