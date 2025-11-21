import { db } from "@/db";
import { webhookLog as webhookLogs } from "@/db/schema/billing";
import { eq } from "drizzle-orm";
import { getProvider } from ".";
import { BillingManager } from "./billing-manager";

// Rate limiting for webhooks (prevent spam)
const webhookRateLimit = new Map<string, number[]>();

function checkRateLimit(provider: string, maxPerMinute = 60): boolean {
  const now = Date.now();
  const minute = 60 * 1000;

  const attempts = webhookRateLimit.get(provider) || [];
  const recentAttempts = attempts.filter((time) => now - time < minute);

  if (recentAttempts.length >= maxPerMinute) {
    return false; // Rate limit exceeded
  }

  recentAttempts.push(now);
  webhookRateLimit.set(provider, recentAttempts);
  return true;
}

export async function handleChangellyWebhook(req: Request): Promise<Response> {
  // Rate limiting
  if (!checkRateLimit("changelly")) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: any;
  let rawBody: string;

  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("X-Signature") || "";

  // Log webhook attempt
  const [webhookLog] = await db
    .insert(webhookLogs)
    .values({
      provider: "changelly",
      eventType: payload.callback_type || "unknown",
      invoiceId: payload.payment_id || payload.txn_id,
      payload,
      signature,
      status: "pending",
    })
    .returning();

  if (!webhookLog) {
    return new Response(JSON.stringify({ error: "Failed to log webhook" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const manager = new BillingManager(getProvider("changelly"));

    // Verify signature BEFORE processing
    const provider = getProvider("changelly");
    if (!provider.verifyWebhook(rawBody, signature)) {
      throw new Error("Invalid signature");
    }

    await manager.processWebhook(payload, signature);

    // Update log
    await db
      .update(webhookLogs)
      .set({ status: "success", processedAt: new Date() })
      .where(eq(webhookLogs.id, webhookLog.id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Changelly webhook error:", error);

    // Update log with error
    await db
      .update(webhookLogs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        attempts: webhookLog.attempts + 1,
      })
      .where(eq(webhookLogs.id, webhookLog.id));

    // Return 200 to prevent retries for invalid signatures
    if (error instanceof Error && error.message.includes("signature")) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 200, // Don't trigger provider retry
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      {
        status: 500, // Trigger provider retry
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
