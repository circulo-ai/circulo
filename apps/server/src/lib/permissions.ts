import { db } from "@/db";
import * as schema from "@/db/schema";
import { getSession, statement, type SessionResponse } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

export type Resource = keyof typeof statement;
export type Action<R extends Resource> = (typeof statement)[R][number];

// Define role permissions with proper typing
type RolePermissions = {
  [K in Resource]: string[];
};

const rolePermissions: Record<string, RolePermissions> = {
  owner: {
    // Default resources from ownerAc
    invitation: ["create", "cancel"],
    member: ["create", "update", "delete"],
    organization: ["update", "delete"],
    team: ["create", "update", "delete"],
    ac: ["read"],
    // Custom resources
    chat: ["create", "update", "delete", "share"],
  },
  admin: {
    // Default resources from adminAc
    invitation: ["create", "cancel"],
    member: ["create", "update", "delete"],
    organization: [],
    team: [],
    ac: [],
    // Custom resources
    chat: ["create", "update", "share"],
  },
  member: {
    // Default resources from memberAc
    invitation: ["create"],
    member: [],
    organization: [],
    team: [],
    ac: [],
    // Custom resources
    chat: ["create", "share"],
  },
};

type RoleType = "owner" | "admin" | "member";

// ============================================================================
// Core Permission Functions
// ============================================================================

/**
 * Get the user's role in an organization
 */
export async function getUserRole(
  userId: string,
  organizationId: string,
): Promise<RoleType | null> {
  const membership = await db
    .select()
    .from(schema.member)
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (membership.length === 0) return null;
  return membership[0].role as RoleType;
}

/**
 * Check if current user has permission for a specific action
 * @param resource - The resource type (e.g., "chat", "member")
 * @param action - The action to check (e.g., "create", "update")
 * @param organizationId - Optional organization ID (uses active org if not provided)
 */
export async function hasPermission<R extends Resource>(
  resource: R,
  action: Action<R>,
  organizationId?: string,
  session?: SessionResponse,
): Promise<boolean> {
  const sessionData = session ?? (await getSession());

  if (!sessionData?.user) return false;

  const orgId =
    organizationId || (sessionData.session as any).activeOrganizationId;
  if (!orgId) return false;

  const role = await getUserRole(sessionData.user.id, orgId);
  if (!role) return false;

  // Get permissions for the role and resource
  const permissions = rolePermissions[role][resource];

  // Type-safe check
  return permissions.includes(action);
}

/**
 * Require permission or throw an error
 * Useful for server actions and API routes
 */
export async function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
  organizationId?: string,
  session?: SessionResponse,
): Promise<void> {
  const allowed = await hasPermission(
    resource,
    action,
    organizationId,
    session,
  );

  if (!allowed) {
    const sessionData = session ?? (await getSession());
    const orgId =
      organizationId || (sessionData?.session as any)?.activeOrganizationId;
    const role = sessionData?.user
      ? await getUserRole(sessionData.user.id, orgId)
      : null;

    throw new Error(
      `Permission denied: ${role || "guest"} cannot ${action} ${resource}`,
    );
  }
}

/**
 * Check if user is a member of an organization
 */
export async function isMemberOf(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const role = await getUserRole(userId, organizationId);
  return role !== null;
}

/**
 * Check if current user is owner of the active organization
 */
export async function isOwner(
  organizationId?: string,
  session?: SessionResponse,
): Promise<boolean> {
  const sessionData = session ?? (await getSession());
  if (!sessionData?.user) return false;

  const orgId =
    organizationId || (sessionData.session as any).activeOrganizationId;
  if (!orgId) return false;

  const role = await getUserRole(sessionData.user.id, orgId);
  return role === "owner";
}

/**
 * Check if current user is admin or owner
 */
export async function isAdminOrOwner(
  organizationId?: string,
  session?: SessionResponse,
): Promise<boolean> {
  const sessionData = session ?? (await getSession());
  if (!sessionData?.user) return false;

  const orgId =
    organizationId || (sessionData.session as any).activeOrganizationId;
  if (!orgId) return false;

  const role = await getUserRole(sessionData.user.id, orgId);
  return role === "owner" || role === "admin";
}

/**
 * Get all organizations where user has a specific role
 */
export async function getOrganizationsByRole(
  userId: string,
  role?: RoleType,
): Promise<Array<{ id: string; name: string; slug: string; role: string }>> {
  const query = db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      role: schema.member.role,
    })
    .from(schema.organization)
    .innerJoin(
      schema.member,
      eq(schema.member.organizationId, schema.organization.id),
    )
    .where(eq(schema.member.userId, userId));

  const results = await query;

  if (role) {
    return results.filter((org) => org.role === role);
  }

  return results;
}

/**
 * Batch check multiple permissions at once
 */
export async function hasPermissions(
  checks: Array<{ resource: Resource; action: string }>,
  organizationId?: string,
  session?: SessionResponse,
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  for (const check of checks) {
    const key = `${check.resource}:${check.action}`;
    results[key] = await hasPermission(
      check.resource,
      check.action as any, // Safe here since we're checking dynamically
      organizationId,
      session,
    );
  }

  return results;
}

/**
 * Get all permissions for current user in an organization
 */
export async function getUserPermissions(
  organizationId?: string,
  session?: SessionResponse,
): Promise<Record<string, string[]>> {
  const sessionData = session ?? (await getSession());
  if (!sessionData?.user) return {};

  const orgId =
    organizationId || (sessionData.session as any).activeOrganizationId;
  if (!orgId) return {};

  const role = await getUserRole(sessionData.user.id, orgId);
  if (!role) return {};

  return rolePermissions[role] as Record<string, string[]>;
}

/**
 * Middleware helper for Next.js API routes
 */
export async function withPermission<R extends Resource>(
  resource: R,
  action: Action<R>,
  organizationId?: string,
) {
  await requirePermission(resource, action, organizationId);
}

// ============================================================================
// Usage Examples
// ============================================================================

/*
// In a server action or API route:
import { requirePermission, hasPermission, isOwner } from "@/lib/auth/permissions";

// Check permission and throw if not allowed
export async function createChat(data: any) {
  await requirePermission("chat", "create");
  // ... create chat logic
}

// Check permission and handle manually
export async function updateChat(chatId: string, data: any) {
  const canUpdate = await hasPermission("chat", "update");
  if (!canUpdate) {
    return { error: "You don't have permission to update chats" };
  }
  // ... update chat logic
}

// Check role
export async function deleteOrganization(orgId: string) {
  if (!(await isOwner(orgId))) {
    throw new Error("Only owners can delete organizations");
  }
  // ... delete logic
}

// Batch permission check
export async function getChatPermissions(orgId: string) {
  return await hasPermissions([
    { resource: "chat", action: "create" },
    { resource: "chat", action: "update" },
    { resource: "chat", action: "delete" },
  ], orgId);
}

// Get all permissions for current user
export async function getCurrentUserPermissions() {
  const permissions = await getUserPermissions();
  // Returns: { chat: ["create", "share"], member: [], invitation: ["create"] }
}
*/
