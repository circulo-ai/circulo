import { agentExecutionReservation, agentExecutionSettings, db } from "@/db";
import { estimateProviderCost } from "@/lib/ai/cost";
import { isCloudRuntime } from "@/lib/deployment/instance-auth";
import { createLogger } from "@/lib/logs/console/logger";
import { usageEventForModel } from "@/lib/usage-ledger";
import {
  DEFAULT_AGENT_EXECUTION_SETTINGS,
  RateLimitError,
  type AgentExecutionSettings,
  type AiProviderId,
} from "@circulo-ai/types";
import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const logger = createLogger("AgentExecutionMeter");
const RESERVATION_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const PLATFORM_MAX_WORKFLOW_RUNTIME_MS = 7 * 24 * 60 * 60 * 1_000;

export class AgentExecutionBudgetError extends RateLimitError {
  constructor(retryAfterSeconds: number, message: string) {
    super(retryAfterSeconds, message);
    this.name = "AgentExecutionBudgetError";
  }
}

export function isAgentExecutionBudgetError(
  error: unknown,
): error is AgentExecutionBudgetError {
  return error instanceof AgentExecutionBudgetError;
}

export type AgentExecutionMeteringContext = {
  organizationId: string;
  userId: string;
  workflowRunId: string;
  workflowStartedAt?: number;
  /** Stable identifier for one agent's checkpointed run within a workflow. */
  agentExecutionId?: string;
  settings: AgentExecutionSettings;
  feature: "agent" | "orchestration";
};

type TokenReservation = {
  id: string;
  idempotencyKey: string;
  reservedTokens: number;
  startedAt: number;
};

function promptTokenEstimate(prompt: unknown): number {
  let binaryParts = 0;
  let imageParts = 0;
  const serialized = JSON.stringify(prompt, (_key, value: unknown) => {
    if (
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value) ||
      (value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "Buffer" &&
        Array.isArray((value as { data?: unknown }).data))
    ) {
      binaryParts += 1;
      return "[binary content]";
    }
    if (typeof value === "string") {
      if (/^data:image\//i.test(value)) {
        imageParts += 1;
        return "[image]";
      }
      if (value.length > 2_000 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
        binaryParts += 1;
        return "[encoded content]";
      }
    }
    return value;
  });
  return Math.max(
    1,
    Math.ceil((serialized?.length ?? 0) / 2) +
      binaryParts * 8_192 +
      imageParts * 8_192,
  );
}

async function reserveTokens(
  context: AgentExecutionMeteringContext,
  modelId: string,
  prompt: unknown,
  maxOutputTokens: number | undefined,
): Promise<TokenReservation> {
  const now = new Date();
  const workflowStartedAt = context.workflowStartedAt ?? now.getTime();
  const workflowRuntimeMs =
    context.settings.workflow.runtimeMs ?? PLATFORM_MAX_WORKFLOW_RUNTIME_MS;
  if (now.getTime() - workflowStartedAt >= workflowRuntimeMs) {
    throw new AgentExecutionBudgetError(
      0,
      "The workspace workflow runtime limit has been reached. Start a new run or ask a workspace manager to raise the limit.",
    );
  }
  const idempotencyKey = randomUUID();
  const reservedTokens =
    promptTokenEstimate(prompt) +
    Math.max(1, Math.floor(maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS));
  const fiveHourStart = new Date(now.getTime() - 5 * 60 * 60 * 1_000);
  const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  return db.transaction(async (txDb) => {
    // This row is also the per-workspace serialization point for reservations.
    await txDb
      .insert(agentExecutionSettings)
      .values({
        organizationId: context.organizationId,
        config: DEFAULT_AGENT_EXECUTION_SETTINGS,
      })
      .onConflictDoNothing({ target: agentExecutionSettings.organizationId });
    await txDb
      .select({ organizationId: agentExecutionSettings.organizationId })
      .from(agentExecutionSettings)
      .where(eq(agentExecutionSettings.organizationId, context.organizationId))
      .for("update");

    await txDb
      .update(agentExecutionReservation)
      .set({ status: "expired" })
      .where(
        and(
          eq(agentExecutionReservation.organizationId, context.organizationId),
          eq(agentExecutionReservation.status, "reserved"),
          lt(agentExecutionReservation.expiresAt, now),
        ),
      );
    await txDb
      .delete(agentExecutionReservation)
      .where(
        and(
          eq(agentExecutionReservation.organizationId, context.organizationId),
          lt(agentExecutionReservation.createdAt, sevenDayStart),
          or(
            eq(agentExecutionReservation.status, "consumed"),
            eq(agentExecutionReservation.status, "released"),
            eq(agentExecutionReservation.status, "expired"),
          ),
        ),
      );

    const [totals] = await txDb
      .select({
        fiveHour: sql<number>`coalesce(sum(case when ${agentExecutionReservation.createdAt} >= ${fiveHourStart} then coalesce(${agentExecutionReservation.actualTokens}, ${agentExecutionReservation.reservedTokens}) else 0 end), 0)`,
        sevenDay: sql<number>`coalesce(sum(coalesce(${agentExecutionReservation.actualTokens}, ${agentExecutionReservation.reservedTokens})), 0)`,
      })
      .from(agentExecutionReservation)
      .where(
        and(
          eq(agentExecutionReservation.organizationId, context.organizationId),
          gt(agentExecutionReservation.createdAt, sevenDayStart),
          or(
            eq(agentExecutionReservation.status, "reserved"),
            eq(agentExecutionReservation.status, "consumed"),
          ),
        ),
      );
    const fiveHourUsed = Number(totals?.fiveHour ?? 0);
    const sevenDayUsed = Number(totals?.sevenDay ?? 0);
    const { rollingFiveHourTokens, rollingSevenDayTokens } =
      context.settings.usageBudgets;

    if (
      context.agentExecutionId &&
      context.settings.agentLoop.tokens !== null
    ) {
      const [agentUsage] = await txDb
        .select({
          tokens: sql<number>`coalesce(sum(coalesce(${agentExecutionReservation.actualTokens}, ${agentExecutionReservation.reservedTokens})), 0)`,
        })
        .from(agentExecutionReservation)
        .where(
          and(
            eq(
              agentExecutionReservation.organizationId,
              context.organizationId,
            ),
            eq(
              agentExecutionReservation.agentExecutionId,
              context.agentExecutionId,
            ),
            or(
              eq(agentExecutionReservation.status, "reserved"),
              eq(agentExecutionReservation.status, "consumed"),
            ),
          ),
        );
      if (
        Number(agentUsage?.tokens ?? 0) + reservedTokens >
        context.settings.agentLoop.tokens
      ) {
        throw new AgentExecutionBudgetError(
          0,
          "This agent has reached its workspace token limit. Continue the task with a higher limit or no workspace cap.",
        );
      }
    }

    if (
      !isCloudRuntime() &&
      rollingFiveHourTokens !== null &&
      fiveHourUsed + reservedTokens > rollingFiveHourTokens
    ) {
      throw new AgentExecutionBudgetError(
        5 * 60 * 60,
        "The workspace rolling five-hour token budget has been reached. New model work can continue when usage leaves the rolling window or a manager raises the budget.",
      );
    }
    if (
      !isCloudRuntime() &&
      rollingSevenDayTokens !== null &&
      sevenDayUsed + reservedTokens > rollingSevenDayTokens
    ) {
      throw new AgentExecutionBudgetError(
        7 * 24 * 60 * 60,
        "The workspace rolling seven-day token budget has been reached. New model work can continue when usage leaves the rolling window or a manager raises the budget.",
      );
    }

    const [reservation] = await txDb
      .insert(agentExecutionReservation)
      .values({
        organizationId: context.organizationId,
        userId: context.userId,
        requestId: context.workflowRunId,
        workflowRunId: context.workflowRunId,
        agentExecutionId: context.agentExecutionId ?? null,
        model: modelId,
        feature: context.feature,
        reservedTokens,
        status: "reserved",
        idempotencyKey,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      })
      .returning({ id: agentExecutionReservation.id });
    if (!reservation) throw new Error("Token usage reservation failed");
    return {
      id: reservation.id,
      idempotencyKey,
      reservedTokens,
      startedAt: now.getTime(),
    };
  });
}

async function releaseTokens(reservation: TokenReservation) {
  await db
    .update(agentExecutionReservation)
    .set({ status: "released", reconciledAt: new Date() })
    .where(
      and(
        eq(agentExecutionReservation.id, reservation.id),
        eq(agentExecutionReservation.status, "reserved"),
      ),
    );
}

async function reconcileTokens(params: {
  reservation: TokenReservation;
  context: AgentExecutionMeteringContext;
  providerId: AiProviderId;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  meteredTokens?: number;
}) {
  const inputTokens = Math.max(0, Math.floor(params.inputTokens));
  const outputTokens = Math.max(0, Math.floor(params.outputTokens));
  const actualTokens = Math.max(
    inputTokens + outputTokens,
    params.meteredTokens ?? 0,
  );
  await db.transaction(async (txDb) => {
    await txDb
      .select({ organizationId: agentExecutionSettings.organizationId })
      .from(agentExecutionSettings)
      .where(
        eq(
          agentExecutionSettings.organizationId,
          params.context.organizationId,
        ),
      )
      .for("update");
    await txDb
      .update(agentExecutionReservation)
      .set({ actualTokens, status: "consumed", reconciledAt: new Date() })
      .where(
        and(
          eq(agentExecutionReservation.id, params.reservation.id),
          eq(agentExecutionReservation.status, "reserved"),
        ),
      );
  });

  if (actualTokens > params.reservation.reservedTokens) {
    logger.warn("Provider usage exceeded the conservative reservation", {
      organizationId: params.context.organizationId,
      workflowRunId: params.context.workflowRunId,
      reservedTokens: params.reservation.reservedTokens,
      actualTokens,
    });
  }

  await usageEventForModel({
    organizationId: params.context.organizationId,
    userId: params.context.userId,
    workflowRunId: params.context.workflowRunId,
    provider: params.providerId,
    model: params.modelId,
    feature: params.context.feature,
    inputTokens,
    outputTokens,
    cachedTokens: params.cachedTokens,
    providerCost: estimateProviderCost({
      providerId: params.providerId,
      modelId: params.modelId,
      inputTokens,
      outputTokens,
      cachedInputTokens: params.cachedTokens,
    }),
    durationMs: Date.now() - params.reservation.startedAt,
    idempotencyKey: params.reservation.idempotencyKey,
  });
}

function toTokenCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function withAgentExecutionMetering(
  model: LanguageModel,
  context: AgentExecutionMeteringContext,
  providerId: AiProviderId,
  modelId: string,
): LanguageModel {
  if (typeof model === "string") {
    throw new Error("A resolved model instance is required for metering");
  }
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      const reservation = await reserveTokens(
        context,
        modelId,
        params.prompt,
        params.maxOutputTokens,
      );
      let result: Awaited<ReturnType<typeof doGenerate>>;
      try {
        result = await doGenerate();
      } catch (error) {
        await releaseTokens(reservation);
        throw error;
      }
      try {
        const inputTokens = toTokenCount(result.usage.inputTokens.total);
        const outputTokens = toTokenCount(result.usage.outputTokens.total);
        const usageReported =
          typeof result.usage.inputTokens.total === "number" &&
          typeof result.usage.outputTokens.total === "number";
        await reconcileTokens({
          reservation,
          context,
          providerId,
          modelId,
          inputTokens,
          outputTokens,
          cachedTokens: toTokenCount(result.usage.inputTokens.cacheRead),
          meteredTokens: usageReported ? undefined : reservation.reservedTokens,
        });
        return result;
      } catch (error) {
        logger.error("Could not reconcile completed model usage", error);
      }
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const reservation = await reserveTokens(
        context,
        modelId,
        params.prompt,
        params.maxOutputTokens,
      );
      let result: Awaited<ReturnType<typeof doStream>>;
      try {
        result = await doStream();
      } catch (error) {
        await releaseTokens(reservation);
        throw error;
      }

      const reader = result.stream.getReader();
      let settled = false;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              if (!settled) {
                settled = true;
                await reconcileTokens({
                  reservation,
                  context,
                  providerId,
                  modelId,
                  inputTokens: 0,
                  outputTokens: 0,
                  meteredTokens: reservation.reservedTokens,
                });
              }
              controller.close();
              return;
            }
            if (next.value.type === "finish" && !settled) {
              settled = true;
              try {
                const inputTokens = toTokenCount(
                  next.value.usage.inputTokens.total,
                );
                const outputTokens = toTokenCount(
                  next.value.usage.outputTokens.total,
                );
                const usageReported =
                  typeof next.value.usage.inputTokens.total === "number" &&
                  typeof next.value.usage.outputTokens.total === "number";
                await reconcileTokens({
                  reservation,
                  context,
                  providerId,
                  modelId,
                  inputTokens,
                  outputTokens,
                  cachedTokens: toTokenCount(
                    next.value.usage.inputTokens.cacheRead,
                  ),
                  meteredTokens: usageReported
                    ? undefined
                    : reservation.reservedTokens,
                });
              } catch (error) {
                logger.error(
                  "Could not reconcile completed model usage",
                  error,
                );
              }
            }
            controller.enqueue(next.value);
          } catch (error) {
            if (!settled) {
              settled = true;
              // Once the provider has started streaming, a transport failure can
              // still have consumed input/output tokens. Keep the conservative
              // reservation instead of releasing budget we cannot measure.
              try {
                await reconcileTokens({
                  reservation,
                  context,
                  providerId,
                  modelId,
                  inputTokens: 0,
                  outputTokens: 0,
                  meteredTokens: reservation.reservedTokens,
                });
              } catch (reconciliationError) {
                logger.error(
                  "Could not reconcile interrupted model stream usage",
                  reconciliationError,
                );
              }
            }
            controller.error(error);
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            if (!settled) {
              settled = true;
              await reconcileTokens({
                reservation,
                context,
                providerId,
                modelId,
                inputTokens: 0,
                outputTokens: 0,
                meteredTokens: reservation.reservedTokens,
              });
            }
          }
        },
      });
      return { ...result, stream: stream as typeof result.stream };
    },
  };

  return wrapLanguageModel({ model, middleware, modelId, providerId });
}
