import { getSubscriptionForOrg, orgHasPlan } from "@/lib/billing/autumn";
import { type Action, type Resource, hasPermission } from "@/lib/permissions";

/**
 * Check if user has both permission AND the org has the feature
 * Use this for actions that require BOTH role permission and subscription access
 */
export async function canAccessFeature(params: {
  resource: Resource;
  action: Action<Resource>;
  requiredPlans?: string[]; // e.g., ["pro", "team", "enterprise"]
  organizationId?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { resource, action, requiredPlans, organizationId } = params;

  // Check permission first (cheaper query)
  const hasPermissionCheck = await hasPermission(
    resource,
    action,
    organizationId
  );

  if (!hasPermissionCheck) {
    return { allowed: false, reason: "insufficient_permissions" };
  }

  // If no plan requirement, permission is enough
  if (!requiredPlans || requiredPlans.length === 0) {
    return { allowed: true };
  }

  // Check subscription
  const session = await import("@/lib/auth").then((m) => m.getSession());
  const orgId =
    organizationId || (session?.session as any)?.activeOrganizationId;

  if (!orgId) {
    return { allowed: false, reason: "no_organization" };
  }

  const hasPlan = await orgHasPlan(orgId, requiredPlans);
  if (!hasPlan) {
    return { allowed: false, reason: "subscription_required" };
  }

  return { allowed: true };
}

/**
 * Require both permission and subscription, throw if not allowed
 */
export async function requireFeatureAccess(params: {
  resource: Resource;
  action: Action<Resource>;
  requiredPlans?: string[];
  organizationId?: string;
}): Promise<void> {
  const result = await canAccessFeature(params);

  if (!result.allowed) {
    const messages = {
      insufficient_permissions:
        "You don't have permission to perform this action",
      subscription_required: `This feature requires a ${params.requiredPlans?.join(
        " or "
      )} plan`,
      no_organization: "No organization context",
    };

    throw new Error(
      messages[result.reason as keyof typeof messages] || "Access denied"
    );
  }
}

/**
 * Check if user can create team organizations
 * Combines: owner role + pro+ subscription on personal org
 */
export async function canUserCreateTeamOrg(userId: string): Promise<boolean> {
  const { db } = await import("@/db");
  const schema = await import("@/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  // Find user's personal organization
  const personalOrg = await db
    .select()
    .from(schema.organization)
    .innerJoin(
      schema.member,
      eq(schema.member.organizationId, schema.organization.id)
    )
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.role, "owner"),
        sql`${schema.organization.metadata}->>'type' = 'personal'`
      )
    )
    .limit(1);

  if (personalOrg.length === 0) return false;

  const orgId = personalOrg[0].organization.id;

  // Check if personal org has feature access
  const subscription = await getSubscriptionForOrg(orgId);
  if (!subscription) return false;

  // Check for the boolean feature directly
  const hasFeature = subscription.features["create_team_org"];
  if (
    hasFeature &&
    hasFeature.included_usage !== undefined &&
    hasFeature.included_usage > 0
  ) {
    return true;
  }

  // Fallback: check plan-based access
  return orgHasPlan(orgId, ["pro", "team", "enterprise"]);
}

/**
 * Get usage limits for current organization
 */
export async function getOrgLimits(organizationId?: string): Promise<{
  maxAgents: number | "unlimited";
  apiCalls: number | "unlimited";
  currentApiCalls: number;
  canCreateTeamOrg: boolean;
  hasPrioritySupport: boolean;
}> {
  const session = await import("@/lib/auth").then((m) => m.getSession());
  const orgId =
    organizationId || (session?.session as any)?.activeOrganizationId;

  if (!orgId) {
    throw new Error("No organization context");
  }

  const subscription = await getSubscriptionForOrg(orgId);

  if (!subscription) {
    // Default free tier limits
    return {
      maxAgents: 3,
      apiCalls: 1000,
      currentApiCalls: 0,
      canCreateTeamOrg: false,
      hasPrioritySupport: false,
    };
  }

  const maxAgents = subscription.features["max_agents"];
  const apiCalls = subscription.features["api_calls"];
  const createTeamOrg = subscription.features["create_team_org"];
  const prioritySupport = subscription.features["priority_support"];

  return {
    maxAgents: maxAgents?.unlimited
      ? "unlimited"
      : maxAgents?.included_usage ?? 3,
    apiCalls: apiCalls?.unlimited
      ? "unlimited"
      : apiCalls?.included_usage ?? 1000,
    currentApiCalls: apiCalls?.usage ?? 0,
    canCreateTeamOrg:
      createTeamOrg?.included_usage !== undefined &&
      createTeamOrg.included_usage > 0,
    hasPrioritySupport:
      prioritySupport?.included_usage !== undefined &&
      prioritySupport.included_usage > 0,
  };
}

// ============================================================================
// Usage Examples
// ============================================================================

/*
// Example 1: Check both permission and subscription for a feature
export async function shareChat(chatId: string) {
  const result = await canAccessFeature({
    resource: "chat",
    action: "share",
    requiredPlans: ["pro", "team", "enterprise"], // Sharing requires paid plan
  });
  
  if (!result.allowed) {
    if (result.reason === "subscription_required") {
      return { error: "Upgrade to Pro to share chats" };
    }
    return { error: "You don't have permission to share chats" };
  }
  
  // Proceed with sharing
}

// Example 2: Require feature access (throws if not allowed)
export async function createAdvancedChat(data: any) {
  await requireFeatureAccess({
    resource: "chat",
    action: "create",
    requiredPlans: ["pro", "team", "enterprise"],
  });
  
  // Create chat logic
}

// Example 3: Check if user can create team org (used in UI)
export async function getCanCreateTeamOrg() {
  const session = await getSession();
  if (!session?.user) return false;
  
  return canUserCreateTeamOrg(session.user.id);
}

// Example 4: Get limits for UI display
export async function getCurrentLimits() {
  const limits = await getOrgLimits();
  
  return {
    agents: `${limits.maxAgents === "unlimited" ? "∞" : limits.maxAgents} agents`,
    apiCalls: limits.apiCalls === "unlimited" 
      ? "Unlimited API calls"
      : `${limits.currentApiCalls} / ${limits.apiCalls} API calls this month`,
    features: {
      teamOrgs: limits.canCreateTeamOrg,
      support: limits.hasPrioritySupport,
    },
  };
}

// Example 5: Permission-only check (no billing)
export async function deleteMember(memberId: string) {
  await requirePermission("member", "delete");
  // No billing check needed - this is purely permission-based
}
*/
