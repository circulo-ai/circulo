import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./signature";

describe("webhook signatures", () => {
  it("accepts a fresh millisecond signature", () => {
    const now = 1_800_000_000_000;
    const body = JSON.stringify({ event: "push" });
    const signature = signWebhookPayload("secret", now, body);

    expect(
      verifyWebhookSignature({
        secret: "secret",
        body,
        signature: `sha256=${signature}`,
        timestamp: String(now),
        now,
      }),
    ).toEqual({ valid: true });
  });

  it("accepts providers that sign Unix seconds", () => {
    const now = 1_800_000_000_000;
    const timestamp = Math.floor(now / 1000);
    const body = "{}";

    expect(
      verifyWebhookSignature({
        secret: "secret",
        body,
        signature: signWebhookPayload("secret", timestamp, body),
        timestamp: String(timestamp),
        now,
      }),
    ).toEqual({ valid: true });
  });

  it("rejects stale and tampered deliveries", () => {
    const now = 1_800_000_000_000;
    const body = "{}";
    const timestamp = now - 10 * 60 * 1000;
    const signature = signWebhookPayload("secret", timestamp, body);

    expect(
      verifyWebhookSignature({
        secret: "secret",
        body,
        signature,
        timestamp: String(timestamp),
        now,
      }),
    ).toMatchObject({
      valid: false,
      reason: "timestamp outside allowed window",
    });
    expect(
      verifyWebhookSignature({
        secret: "secret",
        body,
        signature: "0".repeat(64),
        timestamp: String(now),
        now,
      }),
    ).toMatchObject({ valid: false, reason: "invalid signature" });
  });
});
