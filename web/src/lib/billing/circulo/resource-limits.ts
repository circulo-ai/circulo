import { db } from "@/db";
import { agent, chat, chatAgent, chatMember, knowledgeBase } from "@/db/schema";
import { isBillingEnabled } from "@/lib/environment";
import { createLogger } from "@/lib/logs/console/logger";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getOrganizationBillingContext } from "./billing-context";

const logger = createLogger("ResourceLimits");

// ==================== CONFIGURATION ====================

/**
 * Resource limits by plan
 * -1 means unlimited
 */
const RESOURCE_LIMITS = {
  free: {
    agents: 2,
    knowledgeBases: 1,
    chats: 5,
    chatMembers: 3,
    chatAgents: 2,
    kbSizeBytes: 100 * 1024 * 1024, // 100MB
    kbDocuments: 50,
  },
  pro: {
    agents: 10,
    knowledgeBases: 5,
    chats: 50,
    chatMembers: 10,
    chatAgents: 5,
    kbSizeBytes: 1024 * 1024 * 1024, // 1GB
    kbDocuments: 500,
  },
  team: {
    agents: 50,
    knowledgeBases: 20,
    chats: 500,
    chatMembers: 100,
    chatAgents: 20,
    kbSizeBytes: 10 * 1024 * 1024 * 1024, // 10GB
    kbDocuments: 5000,
  },
  enterprise: {
    agents: -1,
    knowledgeBases: -1,
    chats: -1,
    chatMembers: -1,
    chatAgents: -1,
    kbSizeBytes: -1,
    kbDocuments: -1,
  },
} as const;

export type ResourceType = keyof (typeof RESOURCE_LIMITS)["free"];
export type PlanType = keyof typeof RESOURCE_LIMITS;

// ==================== TYPES ====================

export interface ResourceLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  reason?: string;
}

export interface ResourceContext {
  chatId?: string;
  knowledgeBaseId?: string;
  additionalBytes?: number;
  additionalCount?: number;
}

// ==================== RESOURCE COUNTING ====================

/**
 * Count resources for an organization or specific context
 */
async function countResources(
  organizationId: string,
  resourceType: ResourceType,
  context?: ResourceContext,
): Promise<number> {
  switch (resourceType) {
    case "agents": {
      const result = await db
        .select({ count: count() })
        .from(agent)
        .where(
          and(
            eq(agent.organizationId, organizationId),
            eq(agent.isArchived, false),
          ),
        );
      return result[0]?.count || 0;
    }

    case "knowledgeBases": {
      const result = await db
        .select({ count: count() })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.organizationId, organizationId));
      return result[0]?.count || 0;
    }

    case "chats": {
      const result = await db
        .select({ count: count() })
        .from(chat)
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(chat.isDeleted, false),
          ),
        );
      return result[0]?.count || 0;
    }

    case "chatMembers": {
      if (!context?.chatId) {
        throw new Error("chatId required for chatMembers count");
      }
      const result = await db
        .select({ count: count() })
        .from(chatMember)
        .where(
          and(eq(chatMember.chatId, context.chatId), isNull(chatMember.leftAt)),
        );
      return result[0]?.count || 0;
    }

    case "chatAgents": {
      if (!context?.chatId) {
        throw new Error("chatId required for chatAgents count");
      }
      const result = await db
        .select({ count: count() })
        .from(chatAgent)
        .where(
          and(
            eq(chatAgent.chatId, context.chatId),
            eq(chatAgent.isEnabled, true),
          ),
        );
      return result[0]?.count || 0;
    }

    case "kbSizeBytes": {
      // Sum storage across all knowledge bases in org
      // Adjust this query based on your actual schema
      const result = await db
        .select({
          total: sql<number>`COALESCE(SUM(${knowledgeBase.totalSizeBytes}), 0)`,
        })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.organizationId, organizationId));
      return result[0]?.total || 0;
    }

    case "kbDocuments": {
      if (!context?.knowledgeBaseId) {
        // Count all documents across all KBs in org
        // Adjust based on your document storage schema
        const result = await db
          .select({
            total: sql<number>`COALESCE(SUM(${knowledgeBase.documentCount}), 0)`,
          })
          .from(knowledgeBase)
          .where(eq(knowledgeBase.organizationId, organizationId));
        return result[0]?.total || 0;
      }
      // Count documents in specific KB
      const kbResult = await db
        .select({ documentCount: knowledgeBase.documentCount })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.id, context.knowledgeBaseId))
        .limit(1);
      return kbResult[0]?.documentCount || 0;
    }

    default:
      logger.warn("Unknown resource type", { resourceType });
      return 0;
  }
}

// ==================== LIMIT CHECKING ====================

/**
 * Check if a resource can be created
 */
export async function checkResourceLimit(
  organizationId: string,
  resourceType: ResourceType,
  context?: ResourceContext,
): Promise<ResourceLimitResult> {
  // If billing is disabled, allow everything
  if (!isBillingEnabled) {
    return {
      allowed: true,
      current: 0,
      limit: Infinity,
      remaining: Infinity,
    };
  }

  try {
    // Get org's plan
    const billing = await getOrganizationBillingContext(organizationId);
    const planLimits =
      RESOURCE_LIMITS[billing.plan as PlanType] || RESOURCE_LIMITS.free;
    const limit = planLimits[resourceType];

    // Unlimited for enterprise or if limit is -1
    if (limit === -1) {
      return {
        allowed: true,
        current: 0,
        limit: Infinity,
        remaining: Infinity,
      };
    }

    const current = await countResources(organizationId, resourceType, context);

    // Handle storage check with additional bytes
    if (resourceType === "kbSizeBytes" && context?.additionalBytes) {
      const wouldExceed = current + context.additionalBytes > limit;
      const remaining = Math.max(0, limit - current);

      return {
        allowed: !wouldExceed,
        current,
        limit,
        remaining,
        reason: wouldExceed
          ? `Storage limit exceeded. Using ${formatBytes(current)} of ${formatBytes(limit)}. Need ${formatBytes(context.additionalBytes)} but only ${formatBytes(remaining)} available.`
          : undefined,
      };
    }

    // Handle count-based checks with additional count
    const additionalCount = context?.additionalCount || 1;
    const wouldExceed = current + additionalCount > limit;
    const remaining = Math.max(0, limit - current);

    const resourceNames: Record<ResourceType, string> = {
      agents: "Agents",
      knowledgeBases: "Knowledge bases",
      chats: "Chats",
      chatMembers: "Chat members",
      chatAgents: "Agents in chat",
      kbSizeBytes: "Storage",
      kbDocuments: "Documents",
    };

    return {
      allowed: !wouldExceed,
      current,
      limit,
      remaining,
      reason: wouldExceed
        ? `${resourceNames[resourceType]} limit reached (${current}/${limit}). Upgrade your plan to add more.`
        : undefined,
    };
  } catch (error) {
    logger.error("Failed to check resource limit", {
      organizationId,
      resourceType,
      error,
    });

    // Fail open in case of errors (allow the action)
    return {
      allowed: true,
      current: 0,
      limit: 0,
      remaining: 0,
      reason: "Could not verify limit",
    };
  }
}

/**
 * Check multiple resource limits at once
 */
export async function checkMultipleResourceLimits(
  organizationId: string,
  checks: Array<{ type: ResourceType; context?: ResourceContext }>,
): Promise<{
  allAllowed: boolean;
  results: Record<ResourceType, ResourceLimitResult>;
  failedChecks: ResourceType[];
}> {
  const results: Record<string, ResourceLimitResult> = {};
  const failedChecks: ResourceType[] = [];

  for (const check of checks) {
    const result = await checkResourceLimit(
      organizationId,
      check.type,
      check.context,
    );
    results[check.type] = result;
    if (!result.allowed) {
      failedChecks.push(check.type);
    }
  }

  return {
    allAllowed: failedChecks.length === 0,
    results: results as Record<ResourceType, ResourceLimitResult>,
    failedChecks,
  };
}

// ==================== RESOURCE USAGE SUMMARY ====================

/**
 * Get a summary of all resource usage for an organization
 */
export async function getResourceUsageSummary(organizationId: string): Promise<{
  plan: string;
  resources: Record<
    ResourceType,
    { current: number; limit: number; percentUsed: number }
  >;
}> {
  const billing = await getOrganizationBillingContext(organizationId);
  const planLimits =
    RESOURCE_LIMITS[billing.plan as PlanType] || RESOURCE_LIMITS.free;

  const resourceTypes: ResourceType[] = [
    "agents",
    "knowledgeBases",
    "chats",
    "kbSizeBytes",
    "kbDocuments",
  ];

  const resources: Record<
    string,
    { current: number; limit: number; percentUsed: number }
  > = {};

  for (const resourceType of resourceTypes) {
    const current = await countResources(organizationId, resourceType);
    const limit = planLimits[resourceType];
    const percentUsed =
      limit === -1 ? 0 : limit > 0 ? (current / limit) * 100 : 0;

    resources[resourceType] = {
      current,
      limit: limit === -1 ? Infinity : limit,
      percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
    };
  }

  return {
    plan: billing.plan,
    resources: resources as Record<
      ResourceType,
      { current: number; limit: number; percentUsed: number }
    >,
  };
}

/**
 * Get limits for a specific plan (for displaying upgrade benefits)
 */
export function getPlanLimits(
  plan: PlanType,
): (typeof RESOURCE_LIMITS)[PlanType] {
  return RESOURCE_LIMITS[plan] || RESOURCE_LIMITS.free;
}

/**
 * Compare limits between two plans
 */
export function comparePlanLimits(
  currentPlan: PlanType,
  targetPlan: PlanType,
): Record<
  ResourceType,
  { current: number; target: number; improvement: string }
> {
  const current = RESOURCE_LIMITS[currentPlan] || RESOURCE_LIMITS.free;
  const target = RESOURCE_LIMITS[targetPlan] || RESOURCE_LIMITS.free;

  const comparison: Record<
    string,
    { current: number; target: number; improvement: string }
  > = {};

  for (const key of Object.keys(current) as ResourceType[]) {
    const currentValue = current[key];
    const targetValue = target[key];

    let improvement: string;
    if (targetValue === -1) {
      improvement = "Unlimited";
    } else if (currentValue === -1) {
      improvement = "N/A";
    } else if (targetValue > currentValue) {
      const multiplier = Math.round(targetValue / currentValue);
      improvement = `${multiplier}x more`;
    } else {
      improvement = "Same";
    }

    comparison[key] = {
      current: currentValue === -1 ? Infinity : currentValue,
      target: targetValue === -1 ? Infinity : targetValue,
      improvement,
    };
  }

  return comparison as Record<
    ResourceType,
    { current: number; target: number; improvement: string }
  >;
}

// ==================== UTILITIES ====================

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  if (bytes === Infinity) return "Unlimited";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Export formatBytes for use in other modules
 */
export { formatBytes };
