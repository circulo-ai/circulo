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
   * Note: The apiSecret holds the private key used for signing OUTGOING requests
   * (it should be the RSA private key in PEM format). The apiKey is the public
   * identifier and must be sent in the X-Api-Key header. The callbackPublicKey
   * is the public key used for verifying incoming webhooks.
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

  // API expects X-Signature header — RSA-SHA256 signature over a payload
  // PAYLOAD = METHOD + ":" + PATH + ":" + [EncodeBase64(BODY)] + ":" + TIMESTAMP
  // Then header is EncodeBase64(SIGNATURE_BASE64 + ":" + TIMESTAMP)
  const postUrl = new URL(`${this.baseUrl}/payments`).pathname; // e.g. /api/v1/payments
  const signatureHeader = this.generateApiSignature("POST", postUrl, bodyJson);

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
    const getUrl = new URL(`${this.baseUrl}/payments/${invoiceId}`).pathname;
    const signatureHeader = this.generateApiSignature("GET", getUrl, ""); // sign empty payload for GET

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
      console.warn("Changelly Webhook: Missing signature header or public key.");
      return false;
    }

    // Per Changelly docs the X-Signature header is base64(SIGNATURE_BASE64 + ':' + TIMESTAMP)
    // Decode it first, then split by ':' to get the inner signature and timestamp.
    let decoded: string;
    try {
      decoded = Buffer.from(signatureHeader, "base64").toString("utf8");
    } catch (e) {
      // If it's not base64, maybe the header was already raw 'sig:ts'
      decoded = signatureHeader;
    }

    if (!decoded.includes(":")) {
      // fallback: header isn't in expected form
      console.error("Changelly Webhook: X-Signature header format is invalid after decoding.");
      return false;
    }

    const [signatureBase64, timestamp] = decoded.split(":", 2);
    if (!signatureBase64 || !timestamp) {
      console.error("Changelly Webhook: X-Signature header missing parts.");
      return false;
    }

    // Recreate payload that was signed by Changelly: "<rawBody>:<timestamp>"
    const payload = Buffer.from(`${rawBody}:${timestamp}`, "utf8");

    // Prepare public key PEM (allow either PEM provided or raw base64 key)
    let pem = this.callbackPublicKey.trim();
    if (!pem.startsWith("-----BEGIN")) {
      pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
    }

    try {
      const signature = Buffer.from(signatureBase64, "base64");
      // Verify RSA-SHA256(signature of SHA256(payload))
      return crypto.verify("RSA-SHA256", payload, pem, signature);
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
   * Generates the signature for outgoing requests following Changelly docs.
   *
   * PAYLOAD = METHOD + ":" + PATH + ":" + [EncodeBase64(BODY)] + ":" + TIMESTAMP
   * SIGNATURE = RSASign(SHA256(PAYLOAD), PRIVATE_KEY) -> then Base64(SIGNATURE)
   * X-Signature header = Base64(SIGNATURE_BASE64 + ":" + TIMESTAMP)
   *
   * We support RSA private key PEM in `apiSecret`. If a non-PEM secret is provided,
   * we fallback to HMAC-SHA256 over the same payload (legacy/compat).
   */
  private generateApiSignature(
    method: string,
    path: string,
    bodyJson: string,
    windowSeconds = 3600,
  ): string {
    // Body must be base64-encoded in the payload; if body is empty object, send empty string
    const bodyBase64 = bodyJson && bodyJson !== "{}" ? Buffer.from(bodyJson).toString("base64") : "";

    const timestamp = (Math.floor(Date.now() / 1000) + windowSeconds).toString();
    const payload = [method, path, bodyBase64, timestamp].join(":");

    let signatureBase64: string;

    const key = (this.apiSecret ?? "").toString().trim();
    try {
      if (key.startsWith("-----BEGIN")) {
        // RSA sign the payload
        const sig = crypto.sign("RSA-SHA256", Buffer.from(payload, "utf8"), key);
        signatureBase64 = sig.toString("base64");
      } else {
        // Fallback: HMAC-SHA256 of payload
        const hmac = crypto.createHmac("sha256", key).update(payload).digest();
        signatureBase64 = hmac.toString("base64");
      }
    } catch (e) {
      console.error("Error generating Changelly API signature:", e);
      throw e;
    }

    // Per docs, the header contains base64(SIGNATURE_BASE64 + ':' + TIMESTAMP)
    const headerValue = Buffer.from(`${signatureBase64}:${timestamp}`).toString("base64");
    return headerValue;
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
