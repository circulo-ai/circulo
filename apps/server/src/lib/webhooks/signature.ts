import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "x-wf-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-wf-timestamp";
export const WEBHOOK_EVENT_ID_HEADER = "x-event-id";
export const DEFAULT_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
}

export function verifyWebhookSignature(params: {
  secret: string;
  body: string;
  signature: string | undefined;
  timestamp: string | undefined;
  now?: number;
  maxAgeMs?: number;
}): { valid: boolean; reason?: string } {
  if (!params.secret) return { valid: false, reason: "missing secret" };
  if (!params.signature || !params.timestamp) {
    return { valid: false, reason: "missing signature" };
  }

  const parsedTimestamp = Number(params.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  // Accept seconds as well as milliseconds because many webhook providers
  // use Unix seconds, while the internal workflow gateway uses milliseconds.
  const timestampMs =
    parsedTimestamp < 1_000_000_000_000
      ? parsedTimestamp * 1000
      : parsedTimestamp;
  const now = params.now ?? Date.now();
  const maxAgeMs = params.maxAgeMs ?? DEFAULT_WEBHOOK_MAX_AGE_MS;
  if (Math.abs(now - timestampMs) > maxAgeMs) {
    return { valid: false, reason: "timestamp outside allowed window" };
  }

  const provided = params.signature.startsWith("sha256=")
    ? params.signature.slice("sha256=".length)
    : params.signature;
  const expected = signWebhookPayload(
    params.secret,
    parsedTimestamp,
    params.body,
  );
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "invalid signature" };
  }
  return { valid: true };
}
