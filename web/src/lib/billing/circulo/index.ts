// lib/billing/circulo/index.ts

/**
 * Circulo Billing Module
 *
 * This module provides billing integration for the Circulo multi-agent chat platform.
 * It handles usage tracking, resource limits, rate limiting, and feature gating.
 *
 * @example
 * ```typescript
 * import {
 *   canExecuteInChat,
 *   trackChatUsage,
 *   checkResourceLimit,
 *   preExecutionCheck,
 * } from "@/lib/billing/circulo";
 *
 * // Before execution
 * const check = await preExecutionCheck({
 *   chatId: "chat_xxx",
 *   organizationId: "org_xxx",
 *   userId: "user_xxx",
 * });
 *
 * if (!check.allowed) {
 *   throw new Error(check.reason);
 * }
 *
 * // Execute AI...
 *
 * // After execution
 * await trackChatUsage({
 *   chatId: "chat_xxx",
 *   userId: "user_xxx",
 *   cost: 0.0023,
 *   metadata: { modelId: "gpt-4", inputTokens: 100, outputTokens: 200 },
 * });
 * ```
 */

// ==================== BILLING CONTEXT ====================
export {
  getAgentBillingContext,
  getChatBillingContext,
  getKnowledgeBaseBillingContext,
  getOrganizationBillingContext,
  isUserInPooledBillingOrg,
  type BillingContext,
} from "./billing-context";

// ==================== USAGE TRACKING ====================
export {
  calculateCostWithTools,
  calculateModelCost,
  trackChatUsage,
  trackOrganizationUsage,
  trackStandaloneUsage,
  type TrackOrganizationUsageParams,
  type TrackUsageParams,
  type UsageMetadata,
} from "./usage-tracking";

// ==================== RESOURCE LIMITS ====================
export {
  checkMultipleResourceLimits,
  checkResourceLimit,
  comparePlanLimits,
  formatBytes,
  getPlanLimits,
  getResourceUsageSummary,
  type ResourceContext,
  type ResourceLimitResult,
  type ResourceType,
} from "./resource-limits";

// ==================== LIMIT CHECKS ====================
export {
  RateLimitError,
  // Custom errors
  UpgradeRequiredError,
  UsageLimitError,
  // Usage limit checks
  canExecuteInChat,
  canExecuteInOrganization,
  // Feature access
  checkFeatureAccess,
  // Rate limit checks
  checkRateLimit,
  getRateLimitStatus,
  // Combined checks
  preExecutionCheck,
  requirePlan,
  // Types
  type ExecutionCheckResult,
  type FeatureCheckResult,
  type RateLimitResult,
} from "./limits";

// ==================== RE-EXPORTS FROM CORE BILLING ====================
// These are commonly needed alongside Circulo functions

export { getSimplifiedBillingSummary } from "@/lib/billing/core/billing";
export { getUserSubscriptionState } from "@/lib/billing/core/subscription";
export {
  getUserUsageData,
  getUserUsageLimitInfo,
} from "@/lib/billing/core/usage";
