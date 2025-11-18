import { z } from "zod";

export const invoiceStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
]);

export const invoiceTypeSchema = z.enum([
  "subscription",
  "one_time",
  "usage_based",
  "addon",
  "credit",
  "refund",
  "custom",
]);

export const paymentProviderSchema = z.enum(["changelly"]);

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;
export type PaymentProviderName = z.infer<typeof paymentProviderSchema>;

export interface CreateInvoiceParams {
  userId: string;
  subscriptionId?: number;
  type: InvoiceType;
  usdAmount: string;
  description?: string;
  dueDate?: Date;
  metadata?: Record<string, unknown>;
  lineItems?: InvoiceLineItemInput[];
}

export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unitPrice: string;
  referenceType?: string;
  referenceId?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  checkoutUrl?: string;
  expiresAt?: Date;
}

export interface WebhookEvent {
  provider: PaymentProviderName;
  eventType: string;
  invoiceId: string;
  status: InvoiceStatus;
  paidAt?: Date;
  metadata?: Record<string, unknown>;
}
