import { db } from "@/db";
import { chat, subscription } from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { and, eq } from "drizzle-orm";

const logger = createLogger("BillingContext");

export interface BillingContext {
  /** Whether billing is individual or pooled at organization level */
  scope: "individual" | "organization";
  /** The entity that gets billed (orgId for pooled, orgId for individual too since all chats belong to orgs) */
  referenceId: string;
  /** The organization ID */
  organizationId: string;
  /** The subscription plan */
  plan: "free" | "pro" | "team" | "enterprise";
  /** Whether usage is pooled across all org members */
  isPooled: boolean;
}

/**
 * Get billing context for a chat
 * Determines who pays for usage based on the chat's organization subscription
 */
export async function getChatBillingContext(
  chatId: string,
): Promise<BillingContext> {
  const chatRecord = await db
    .select({ organizationId: chat.organizationId })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  if (chatRecord.length === 0) {
    logger.error("Chat not found for billing context", { chatId });
    throw new Error(`Chat not found: ${chatId}`);
  }

  return getOrganizationBillingContext(chatRecord[0].organizationId);
}

/**
 * Get billing context for an organization
 * Checks if the org has a team/enterprise subscription for pooled billing
 */
export async function getOrganizationBillingContext(
  organizationId: string,
): Promise<BillingContext> {
  // Check for active organization subscription
  const orgSubscription = await db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      referenceId: subscription.referenceId,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, organizationId),
        eq(subscription.status, "active"),
      ),
    )
    .limit(1);

  // Determine if this is a pooled plan
  const hasPooledPlan =
    orgSubscription.length > 0 &&
    (orgSubscription[0].plan === "team" ||
      orgSubscription[0].plan === "enterprise");

  if (hasPooledPlan) {
    logger.debug("Organization has pooled billing", {
      organizationId,
      plan: orgSubscription[0].plan,
    });

    return {
      scope: "organization",
      referenceId: organizationId,
      organizationId,
      plan: orgSubscription[0].plan as "team" | "enterprise",
      isPooled: true,
    };
  }

  // Check if org has a pro subscription
  const hasProPlan =
    orgSubscription.length > 0 && orgSubscription[0].plan === "pro";

  if (hasProPlan) {
    logger.debug("Organization has pro plan (individual billing)", {
      organizationId,
    });

    return {
      scope: "individual",
      referenceId: organizationId,
      organizationId,
      plan: "pro",
      isPooled: false,
    };
  }

  // Default to free plan
  logger.debug("Organization on free plan", { organizationId });

  return {
    scope: "individual",
    referenceId: organizationId,
    organizationId,
    plan: "free",
    isPooled: false,
  };
}

/**
 * Get billing context for an agent
 * Agents belong to organizations, so billing flows through the org
 */
export async function getAgentBillingContext(
  agentId: string,
): Promise<BillingContext> {
  const { agent } = await import("@/db/schema");

  const agentRecord = await db
    .select({ organizationId: agent.organizationId })
    .from(agent)
    .where(eq(agent.id, agentId))
    .limit(1);

  if (agentRecord.length === 0) {
    logger.error("Agent not found for billing context", { agentId });
    throw new Error(`Agent not found: ${agentId}`);
  }

  return getOrganizationBillingContext(agentRecord[0].organizationId);
}

/**
 * Get billing context for a knowledge base
 */
export async function getKnowledgeBaseBillingContext(
  knowledgeBaseId: string,
): Promise<BillingContext> {
  const { knowledgeBase } = await import("@/db/schema");

  const kbRecord = await db
    .select({ organizationId: knowledgeBase.organizationId })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.id, knowledgeBaseId))
    .limit(1);

  if (kbRecord.length === 0) {
    logger.error("Knowledge base not found for billing context", {
      knowledgeBaseId,
    });
    throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
  }

  return getOrganizationBillingContext(kbRecord[0].organizationId);
}

/**
 * Check if a user belongs to an organization with pooled billing
 */
export async function isUserInPooledBillingOrg(userId: string): Promise<{
  isPooled: boolean;
  organizationId?: string;
  plan?: string;
}> {
  const { member } = await import("@/db/schema");

  // Get user's organization memberships
  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));

  if (memberships.length === 0) {
    return { isPooled: false };
  }

  // Check each org for pooled subscription
  for (const m of memberships) {
    const billing = await getOrganizationBillingContext(m.organizationId);
    if (billing.isPooled) {
      return {
        isPooled: true,
        organizationId: m.organizationId,
        plan: billing.plan,
      };
    }
  }

  return { isPooled: false };
}
