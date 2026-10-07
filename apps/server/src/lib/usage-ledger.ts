import { db, usageEvent } from "@/db";
import { eq } from "drizzle-orm";

export type UsageEventInput = {
  organizationId: string;
  userId?: string | null;
  requestId: string;
  workflowRunId?: string | null;
  provider: string;
  model?: string | null;
  feature: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  durationMs?: number | null;
  providerCost?: number;
  platformCost?: number;
  billableAmount?: number;
  idempotencyKey: string;
};

function nonNegativeInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function nonNegativeDecimal(value: number | undefined): string {
  return Number.isFinite(value) ? Math.max(0, value ?? 0).toFixed(8) : "0";
}

/**
 * Record one usage event. The unique idempotency key is the billing boundary:
 * retries and durable workflow replay are safe to call repeatedly.
 */
export async function recordUsageEvent(input: UsageEventInput) {
  const [inserted] = await db
    .insert(usageEvent)
    .values({
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      requestId: input.requestId,
      workflowRunId: input.workflowRunId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      feature: input.feature,
      inputTokens: nonNegativeInteger(input.inputTokens),
      outputTokens: nonNegativeInteger(input.outputTokens),
      cachedTokens: nonNegativeInteger(input.cachedTokens),
      durationMs:
        input.durationMs === null || input.durationMs === undefined
          ? null
          : nonNegativeInteger(input.durationMs),
      providerCost: nonNegativeDecimal(input.providerCost),
      platformCost: nonNegativeDecimal(input.platformCost),
      billableAmount: nonNegativeDecimal(input.billableAmount),
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: usageEvent.idempotencyKey })
    .returning();

  if (inserted) return inserted;
  return db.query.usageEvent.findFirst({
    where: eq(usageEvent.idempotencyKey, input.idempotencyKey),
  });
}

export function usageEventForModel(params: {
  organizationId: string;
  userId: string;
  workflowRunId: string;
  provider: string;
  model: string;
  feature: "chat" | "agent" | "orchestration";
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  providerCost: number;
  durationMs: number;
  idempotencyKey: string;
}) {
  return recordUsageEvent({
    ...params,
    requestId: params.workflowRunId,
    billableAmount: params.providerCost,
  });
}
