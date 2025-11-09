import { CreateInvoiceParams, CreateInvoiceResult, InvoiceStatus, PaymentProviderName, WebhookEvent } from "./types";

export abstract class PaymentProvider {
  abstract readonly name: PaymentProviderName;

  abstract createInvoice(
    params: CreateInvoiceParams
  ): Promise<CreateInvoiceResult>;

  abstract getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus>;

  abstract verifyWebhook(payload: unknown, signature: string): boolean;

  abstract parseWebhook(payload: unknown): WebhookEvent;

  async handleWebhook?(event: WebhookEvent): Promise<void>;
}
