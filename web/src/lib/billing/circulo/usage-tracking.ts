import { db } from "@/db";
import { user, userStats } from "@/db/schema";
import { maybeSendUsageThresholdEmail } from "@/lib/billing/core/usage";
import {
  checkAndBillOrganizationOverageThreshold,
  checkAndBillOverageThreshold,
} from "@/lib/billing/threshold-billing";
import { isBillingEnabled } from "@/lib/environment";
import { createLogger } from "@/lib/logs/console/logger";
import { eq, sql } from "drizzle-orm";
import {
  getChatBillingContext,
  getOrganizationBillingContext,
} from "./billing-context";

const logger = createLogger("UsageTracking");

// ==================== TYPES ====================

export interface UsageMetadata {
  agentId?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: number;
  knowledgeBaseQueries?: number;
  [key: string]: unknown;
}

export interface TrackUsageParams {
  chatId: string;
  userId: string;
  cost: number;
  metadata?: UsageMetadata;
}

export interface TrackOrganizationUsageParams {
  organizationId: string;
  userId: string;
  cost: number;
  metadata?: UsageMetadata;
}

// ==================== HELPERS ====================

function parseDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number.parseFloat(value.toString());
}

async function getUserInfo(userId: string) {
  const users = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return users[0] || null;
}

// ==================== CORE TRACKING ====================

/**
 * Track usage for a chat interaction
 * Automatically determines billing context and routes to appropriate handler
 */
export async function trackChatUsage(params: TrackUsageParams): Promise<void> {
  const { chatId, userId, cost, metadata } = params;

  if (!isBillingEnabled) {
    logger.debug("Billing disabled, skipping usage tracking", {
      chatId,
      userId,
    });
    return;
  }

  if (cost <= 0) {
    logger.debug("Zero or negative cost, skipping tracking", { chatId, cost });
    return;
  }

  try {
    const billing = await getChatBillingContext(chatId);

    logger.debug("Tracking chat usage", {
      chatId,
      userId,
      cost,
      billingScope: billing.scope,
      isPooled: billing.isPooled,
      plan: billing.plan,
    });

    // Get current state for threshold email calculation
    const beforeStats = await db
      .select({
        currentPeriodCost: userStats.currentPeriodCost,
        currentUsageLimit: userStats.currentUsageLimit,
      })
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);

    const currentBefore = parseDecimal(beforeStats[0]?.currentPeriodCost);
    const limit = parseDecimal(beforeStats[0]?.currentUsageLimit);
    const percentBefore = limit > 0 ? (currentBefore / limit) * 100 : 0;

    // Always track per-user (for attribution and analytics)
    await updateUserStats(userId, cost, metadata);

    const currentAfter = currentBefore + cost;
    const percentAfter = limit > 0 ? (currentAfter / limit) * 100 : 0;

    // Trigger threshold billing based on billing context
    if (billing.isPooled) {
      await checkAndBillOrganizationOverageThreshold(billing.organizationId);
    } else {
      await checkAndBillOverageThreshold(userId);
    }

    // Send threshold notification emails
    await sendThresholdEmailIfNeeded({
      billing,
      userId,
      percentBefore,
      percentAfter,
      currentUsageAfter: currentAfter,
      limit,
    });

    logger.info("Usage tracked successfully", {
      chatId,
      userId,
      cost,
      newTotal: currentAfter,
    });
  } catch (error) {
    logger.error("Failed to track chat usage", {
      chatId,
      userId,
      cost,
      error,
    });
    // Don't throw - usage tracking failure shouldn't break the app
  }
}

/**
 * Track usage directly for an organization context
 * Use when you have the org context but not a specific chat
 */
export async function trackOrganizationUsage(
  params: TrackOrganizationUsageParams,
): Promise<void> {
  const { organizationId, userId, cost, metadata } = params;

  if (!isBillingEnabled) {
    logger.debug("Billing disabled, skipping usage tracking");
    return;
  }

  if (cost <= 0) {
    return;
  }

  try {
    const billing = await getOrganizationBillingContext(organizationId);

    // Get current state
    const beforeStats = await db
      .select({
        currentPeriodCost: userStats.currentPeriodCost,
        currentUsageLimit: userStats.currentUsageLimit,
      })
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);

    const currentBefore = parseDecimal(beforeStats[0]?.currentPeriodCost);
    const limit = parseDecimal(beforeStats[0]?.currentUsageLimit);
    const percentBefore = limit > 0 ? (currentBefore / limit) * 100 : 0;

    // Update user stats
    await updateUserStats(userId, cost, metadata);

    const currentAfter = currentBefore + cost;
    const percentAfter = limit > 0 ? (currentAfter / limit) * 100 : 0;

    // Threshold billing
    if (billing.isPooled) {
      await checkAndBillOrganizationOverageThreshold(organizationId);
    } else {
      await checkAndBillOverageThreshold(userId);
    }

    // Threshold emails
    await sendThresholdEmailIfNeeded({
      billing,
      userId,
      percentBefore,
      percentAfter,
      currentUsageAfter: currentAfter,
      limit,
    });

    logger.info("Organization usage tracked", {
      organizationId,
      userId,
      cost,
    });
  } catch (error) {
    logger.error("Failed to track organization usage", {
      organizationId,
      userId,
      error,
    });
  }
}

/**
 * Track usage for a standalone operation (no chat context)
 * Examples: API calls, background jobs, file processing
 */
export async function trackStandaloneUsage(params: {
  userId: string;
  organizationId: string;
  cost: number;
  operationType: string;
  metadata?: UsageMetadata;
}): Promise<void> {
  const { userId, organizationId, cost, operationType, metadata } = params;

  if (!isBillingEnabled || cost <= 0) {
    return;
  }

  try {
    logger.debug("Tracking standalone usage", {
      userId,
      organizationId,
      operationType,
      cost,
    });

    await trackOrganizationUsage({
      organizationId,
      userId,
      cost,
      metadata: { ...metadata, operationType },
    });
  } catch (error) {
    logger.error("Failed to track standalone usage", {
      userId,
      organizationId,
      operationType,
      error,
    });
  }
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Update user stats with new usage
 */
async function updateUserStats(
  userId: string,
  cost: number,
  metadata?: UsageMetadata,
): Promise<void> {
  const tokenCount =
    (metadata?.inputTokens || 0) + (metadata?.outputTokens || 0);

  await db
    .update(userStats)
    .set({
      currentPeriodCost: sql`${userStats.currentPeriodCost} + ${cost}`,
      totalCost: sql`${userStats.totalCost} + ${cost}`,
      totalTokensUsed:
        tokenCount > 0
          ? sql`${userStats.totalTokensUsed} + ${tokenCount}`
          : userStats.totalTokensUsed,
      totalChatExecutions: sql`${userStats.totalChatExecutions} + 1`,
      lastActive: new Date(),
    })
    .where(eq(userStats.userId, userId));
}

/**
 * Send threshold email notifications when crossing 80% or 90%
 */
async function sendThresholdEmailIfNeeded(params: {
  billing: Awaited<ReturnType<typeof getChatBillingContext>>;
  userId: string;
  percentBefore: number;
  percentAfter: number;
  currentUsageAfter: number;
  limit: number;
}): Promise<void> {
  const {
    billing,
    userId,
    percentBefore,
    percentAfter,
    currentUsageAfter,
    limit,
  } = params;

  // Only send if crossing thresholds
  const crosses80 = percentBefore < 80 && percentAfter >= 80;
  const crosses90 = percentBefore < 90 && percentAfter >= 90;

  if (!crosses80 && !crosses90) {
    return;
  }

  try {
    const userInfo = await getUserInfo(userId);

    const planNames: Record<string, string> = {
      free: "Free",
      pro: "Pro",
      team: "Team",
      enterprise: "Enterprise",
    };

    await maybeSendUsageThresholdEmail({
      scope: billing.isPooled ? "organization" : "user",
      planName: planNames[billing.plan] || "Free",
      percentBefore,
      percentAfter,
      userId,
      userEmail: userInfo?.email,
      userName: userInfo?.name || undefined,
      organizationId: billing.isPooled ? billing.organizationId : undefined,
      currentUsageAfter,
      limit,
    });
  } catch (error) {
    logger.error("Failed to send threshold email", { userId, error });
  }
}

// ==================== COST CALCULATION HELPERS ====================

/**
 * Model pricing per 1K tokens (in dollars)
 * Update these based on actual provider pricing
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },

  // Anthropic
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "claude-3.5-sonnet": { input: 0.003, output: 0.015 },

  // Google
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-2.5-flash": { input: 0.00025, output: 0.0005 },

  // Default fallback
  default: { input: 0.001, output: 0.002 },
};

/**
 * Calculate cost for an LLM call
 */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[modelId] || MODEL_PRICING.default;

  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Calculate cost with tool usage
 */
export function calculateCostWithTools(params: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls?: number;
  knowledgeBaseQueries?: number;
}): number {
  const {
    modelId,
    inputTokens,
    outputTokens,
    toolCalls = 0,
    knowledgeBaseQueries = 0,
  } = params;

  let cost = calculateModelCost(modelId, inputTokens, outputTokens);

  // Add tool call costs (example: $0.001 per tool call)
  if (toolCalls > 0) {
    cost += toolCalls * 0.001;
  }

  // Add knowledge base query costs (example: $0.0005 per query)
  if (knowledgeBaseQueries > 0) {
    cost += knowledgeBaseQueries * 0.0005;
  }

  return cost;
}
