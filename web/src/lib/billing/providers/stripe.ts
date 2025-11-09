import Stripe from "stripe";
import { PaymentProvider } from "../abstraction/payment-provider";
import {
  CreateInvoiceParams,
  CreateInvoiceResult,
  InvoiceStatus,
  WebhookEvent,
} from "../abstraction/types";

export class StripeProvider extends PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;

  constructor(apiKey: string) {
    super();
    this.stripe = new Stripe(apiKey, { apiVersion: "2025-10-29.clover" });
  }

  async createInvoice(
    params: CreateInvoiceParams,
  ): Promise<CreateInvoiceResult> {
    // Create customer if needed
    const customer = await this.stripe.customers.create({
      metadata: { userId: params.userId.toString() },
    });

    // Create invoice
    const invoice = await this.stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: params.dueDate
        ? Math.ceil(
            (params.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          )
        : 30,
      description: params.description,
      metadata: {
        userId: params.userId.toString(),
        subscriptionId: params.subscriptionId?.toString() || "",
        type: params.type,
        ...(params.metadata as Record<string, string>),
      },
    });

    // Add line items
    if (params.lineItems?.length) {
      for (const item of params.lineItems) {
        await this.stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_amount_decimal: Math.round(
            parseFloat(item.unitPrice) * 100,
          ).toPrecision(10),
          currency: "usd",
          metadata: item.metadata as Record<string, string>,
        });
      }
    } else {
      await this.stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: Math.round(parseFloat(params.usdAmount) * 100),
        currency: "usd",
      });
    }

    // Finalize and send
    await this.stripe.invoices.finalizeInvoice(invoice.id);

    return {
      invoiceId: invoice.id,
      checkoutUrl: invoice.hosted_invoice_url || undefined,
    };
  }

  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    const invoice = await this.stripe.invoices.retrieve(invoiceId);
    return this.mapStatus(invoice.status);
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
      return true;
    } catch {
      return false;
    }
  }

  parseWebhook(payload: any): WebhookEvent {
    const invoice = payload.data.object;
    return {
      provider: "stripe" as const, // Add 'as const'
      eventType: payload.type,
      invoiceId: invoice.id,
      status: this.mapStatus(invoice.status),
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : undefined,
      metadata: invoice.metadata,
    };
  }

  private mapStatus(stripeStatus: string | null): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      draft: "pending",
      open: "pending",
      paid: "paid",
      uncollectible: "failed",
      void: "canceled",
    };
    return statusMap[stripeStatus || "draft"] ?? "pending";
  }
}
