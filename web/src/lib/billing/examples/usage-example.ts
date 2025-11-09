import UsageService from "@/lib/billing/services/usage-service";

/**
 * Simple examples showing how to use UsageService in an action pipeline.
 */
export async function handleChatTokens(
  userId: string,
  tokens: number,
  meta?: Record<string, any>,
) {
  const svc = new UsageService();

  // Optional short-term rate limit: 30 actions per minute
  const rl = await svc.checkRateLimit(userId, "chat_tokens", 30, 60);
  if (!rl.allowed) {
    throw new Error("rate_limited");
  }

  const precheck = await svc.canConsume(userId, "chat_tokens", tokens);
  if (!precheck.allowed) {
    throw new Error("not_allowed");
  }

  const result = await svc.applyConsumption(userId, "chat_tokens", tokens, {
    idempotencyKey:
      meta?.idempotencyKey ?? `chat:${meta?.chatId}:msg:${meta?.messageId}`,
    metadata: { ...(meta ?? {}), model: meta?.model ?? "unknown" },
    description: "Chat token usage",
  });

  return result; // { freeUnitsApplied, billableUnits, costUSD, pastDue, walletBalanceAfter }
}

export async function handleImageRequest(
  userId: string,
  meta?: Record<string, any>,
) {
  const svc = new UsageService();
  const precheck = await svc.canConsume(userId, "image_requests", 1);
  const res = await svc.applyConsumption(userId, "image_requests", 1, {
    idempotencyKey: meta?.idempotencyKey,
    metadata: meta,
    description: "Image generation request",
  });
  return res;
}
