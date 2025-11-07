import crypto from "crypto";
import { PaymentProvider } from "../abstraction/payment-provider";
import {
  CreateInvoiceParams,
  CreateInvoiceResult,
  InvoiceStatus,
  WebhookEvent,
} from "../abstraction/types";

interface ChangellyInvoiceResponse {
  id: string;
  payment_url?: string;
  state?: string;
  status?: string;
  deadline_at?: string;
  updated_at?: string;
}

interface ChangellyWebhookPayload {
  callback_type?: string; // "PAYMENT" or "WITHDRAWAL"
  payment_id?: string;
  txn_id?: string;
  state?: string;
  completed_at?: string;
  created_at?: string;
  other_data?: any;
  // accept flexible shape from changelly callbacks
  [key: string]: any;
}

export class ChangellyProvider extends PaymentProvider {
  readonly name = "changelly" as const;

  /**
   * Note: The apiSecret is used for signing OUTGOING requests (createInvoice).
   * The callbackPublicKey is used for verifying INCOMING webhooks.
   */
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly callbackPublicKey: string, // REQUIRED for webhook verification
    private readonly baseUrl = "https://api.pay.changelly.com/api/v1",
  ) {
    super();
  }

  async createInvoice(
    params: CreateInvoiceParams,
  ): Promise<CreateInvoiceResult> {
    // Build request body matching the openapi "create payment (invoice)" schema.
    const body = {
      type: "INVOICE",
      nominal_currency: "USD",
      nominal_amount: String(params.usdAmount),
      title: params.description ?? "Payment",
      description: params.description ?? "Payment",
      order_id: `${params.type}_${params.userId}_${Date.now()}`,
      other_data: params.metadata ?? {},
    };

    const bodyJson = JSON.stringify(body);

    // API expects X-Signature header — HMAC-SHA256 of the body using apiSecret.
    // Format: <signature_base64>:<timestamp>
    const signatureHeader = this.generateApiSignature(bodyJson);

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signatureHeader,
        // keep apiKey header as well (some integrations expect it)
        "X-Api-Key": this.apiKey,
      },
      body: bodyJson,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Changelly API Invoice Error:", error);
      throw new Error(`Changelly API error: Failed to create invoice.`);
    }

    const data = (await response.json()) as ChangellyInvoiceResponse;

    return {
      invoiceId: data.id,
      checkoutUrl: data.payment_url,
      expiresAt: data.deadline_at ? new Date(data.deadline_at) : undefined,
    };
  }

  async getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    // For GET requests we sign an empty body; include timestamp in signature header.
    const signatureHeader = this.generateApiSignature(""); // sign empty payload for GET

    const response = await fetch(`${this.baseUrl}/payments/${invoiceId}`, {
      method: "GET",
      headers: {
        "X-Signature": signatureHeader,
        "X-Api-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Changelly API Get Invoice Error:", text);
      throw new Error("Failed to fetch invoice status");
    }

    const data = (await response.json()) as ChangellyInvoiceResponse;

    // The API uses values like CREATED / WAITING / COMPLETED / FAILED / CANCELED
    return this.mapStatus(data.state ?? data.status ?? "");
  }

  /**
   * Verifies the Changelly webhook signature.
   *
   * The callback header ("X-Signature") may be provided either as:
   *  - "<base64_signature>:<timestamp>" (most common) OR
   *  - base64("<base64_signature>:<timestamp>") (some integrations double-encode).
   *
   * The payload to verify is: <rawBody>:<timestamp>
   *
   * The signature itself is an RSA signature and is verified with the provided public key.
   */
  verifyWebhook(rawBody: string, signatureHeader: string): boolean {
    if (!signatureHeader || !this.callbackPublicKey) {
      console.warn(
        "Changelly Webhook: Missing signature header or public key.",
      );
      return false;
    }

    // Normalize header: support both raw "sig:ts" and base64("sig:ts")
    let decodedHeader = signatureHeader;
    try {
      // if header appears base64-encoded (no colon after decoding), try decode
      if (!decodedHeader.includes(":")) {
        const attempted = Buffer.from(signatureHeader, "base64").toString(
          "utf8",
        );
        if (attempted.includes(":")) {
          decodedHeader = attempted;
        }
      }
    } catch {
      // if decoding fails, keep original value
      decodedHeader = signatureHeader;
    }

    const parts = decodedHeader.split(":");
    if (parts.length !== 2) {
      console.error("Changelly Webhook: X-Signature header format is invalid.");
      return false;
    }

    const [signatureBase64, timestamp] = parts;
    if (!signatureBase64 || !timestamp) {
      console.error("Changelly Webhook: X-Signature header missing parts.");
      return false;
    }

    // Recreate payload that was signed by Changelly: "<rawBody>:<timestamp>"
    const payload = Buffer.from(`${rawBody}:${timestamp}`);

    // Prepare public key PEM (allow either PEM provided or raw base64 key)
    let pem = this.callbackPublicKey.trim();
    if (!pem.startsWith("-----BEGIN")) {
      pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
    }

    try {
      const signature = Buffer.from(signatureBase64, "base64");

      // Use RSA-SHA256 verification
      const verified = crypto.verify("RSA-SHA256", payload, pem, signature);
      return verified;
    } catch (e) {
      console.error("Error during Changelly webhook verification:", e);
      return false;
    }
  }

  parseWebhook(payload: ChangellyWebhookPayload): WebhookEvent {
    // Support both payment and withdrawal callbacks. Normalize fields.
    const providerId = payload.payment_id ?? payload.txn_id ?? payload.id;
    const rawStatus = (payload.state ?? payload.status ?? "")
      .toString()
      .toUpperCase();

    return {
      provider: "changelly",
      eventType: payload.callback_type ?? "invoice.updated",
      invoiceId: providerId,
      status: this.mapStatus(rawStatus),
      paidAt: payload.completed_at
        ? new Date(payload.completed_at)
        : payload.updated_at
          ? new Date(payload.updated_at)
          : undefined,
      metadata: payload.other_data ?? payload.metadata ?? payload,
    };
  }

  /**
   * Generates the signature for outgoing requests.
   *
   * Returns a string in the format: "<signature_base64>:<timestamp>"
   * where signature is HMAC-SHA256(apiSecret, body).
   */
  private generateApiSignature(data: string): string {
    const hmac = crypto
      .createHmac("sha256", this.apiSecret)
      .update(data)
      .digest();
    const signatureBase64 = hmac.toString("base64");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return `${signatureBase64}:${timestamp}`;
  }

  private mapStatus(changellyStatus: string): InvoiceStatus {
    const s = (changellyStatus ?? "").toString().toUpperCase();
    const statusMap: Record<string, InvoiceStatus> = {
      CREATED: "pending",
      WAITING: "pending",
      CONFIRMING: "pending",
      COMPLETED: "paid",
      FINISHED: "paid",
      FAILED: "failed",
      CANCELED: "canceled",
      REFUNDED: "canceled",
      EXPIRED: "expired",
      OVERDUE: "expired",
    };
    return statusMap[s] ?? "pending";
  }
}
