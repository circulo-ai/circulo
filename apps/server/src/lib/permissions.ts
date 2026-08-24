import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  adminRole,
  getSession,
  memberRole,
  ownerRole,
  statement,
  type SessionResponse,
} from "@/lib/auth";
import { ForbiddenError } from "@circulo-ai/types";
import { and, eq, inArray } from "drizzle-orm";

export type Resource = keyof typeof statement;
export type Action<R extends Resource> = (typeof statement)[R][number];

type RoleType = "owner" | "admin" | "member" | (string & {});

const organizationRoles: Record<string, any> = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
};

function roleAllows(role: string, resource: string, action: string): boolean {
  const statements = organizationRoles[role]?.statements as
    | Record<string, string[]>
    | undefined;
  return Boolean(statements?.[resource]?.includes(action));
}

async function customRoleAllows(
  organizationId: string,
  roles: string[],
  resource: string,
  action: string,
) {
  if (!roles.length) return false;
  const matches = await db
    .select({ id: schema.workspaceRolePermission.id })
    .from(schema.workspaceRolePermission)
    .innerJoin(
      schema.workspaceRole,
      eq(schema.workspaceRole.id, schema.workspaceRolePermission.roleId),
    )
    .where(
      and(
        eq(schema.workspaceRole.organizationId, organizationId),
        inArray(schema.workspaceRole.key, roles),
        eq(schema.workspaceRolePermission.resource, resource),
        eq(schema.workspaceRolePermission.action, action),
      ),
    )
    .limit(1);
  return matches.length > 0;
}

function getSessionActiveOrganizationId(
  session?: SessionResponse,
): string | undefined {
  return (session?.session as { activeOrganizationId?: string } | undefined)
    ?.activeOrganizationId;
}

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

  const membershipRow = membership[0];
  if (!membershipRow) return null;
  return membershipRow.role as RoleType;
}

export async function getUserRoles(
  userId: string,
  organizationId: string,
): Promise<string[]> {
  const role = await getUserRole(userId, organizationId);
  return role
    ? role
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
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
  const orgId = organizationId || getSessionActiveOrganizationId(sessionData);
  if (!orgId) return false;

  const apiKeyPermissions = (sessionData?.session as any)?.apiKeyPermissions as
    | Record<string, string[]>
    | null
    | undefined;
  if (!sessionData?.user) {
    return Boolean(apiKeyPermissions?.[resource]?.includes(action as string));
  }

  if (
    apiKeyPermissions &&
    !apiKeyPermissions[resource]?.includes(action as string)
  ) {
    return false;
  }

  const roles = await getUserRoles(sessionData.user.id, orgId);
  if (roles.some((role) => roleAllows(role, resource, action))) return true;
  return customRoleAllows(orgId, roles, resource, action as string);
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
    const orgId = organizationId || getSessionActiveOrganizationId(sessionData);
    const role =
      sessionData?.user && orgId
        ? await getUserRole(sessionData.user.id, orgId)
        : null;

    throw new ForbiddenError(
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

  const orgId = organizationId || getSessionActiveOrganizationId(sessionData);
  if (!orgId) return false;

  return (await getUserRoles(sessionData.user.id, orgId)).includes("owner");
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

  const orgId = organizationId || getSessionActiveOrganizationId(sessionData);
  if (!orgId) return false;

  const roles = await getUserRoles(sessionData.user.id, orgId);
  return roles.includes("owner") || roles.includes("admin");
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

  const orgId = organizationId || getSessionActiveOrganizationId(sessionData);
  if (!orgId) return {};

  const roles = await getUserRoles(sessionData.user.id, orgId);
  const permissions: Record<string, string[]> = {};
  for (const role of roles) {
    const statements = organizationRoles[role]?.statements as
      | Record<string, string[]>
      | undefined;
    for (const [resource, actions] of Object.entries(statements ?? {})) {
      permissions[resource] = Array.from(
        new Set([...(permissions[resource] ?? []), ...actions]),
      );
    }
  }

  if (roles.length) {
    const customPermissions = await db
      .select({
        resource: schema.workspaceRolePermission.resource,
        action: schema.workspaceRolePermission.action,
      })
      .from(schema.workspaceRolePermission)
      .innerJoin(
        schema.workspaceRole,
        eq(schema.workspaceRole.id, schema.workspaceRolePermission.roleId),
      )
      .where(
        and(
          eq(schema.workspaceRole.organizationId, orgId),
          inArray(schema.workspaceRole.key, roles),
        ),
      );
    for (const permission of customPermissions) {
      permissions[permission.resource] = Array.from(
        new Set([
          ...(permissions[permission.resource] ?? []),
          permission.action,
        ]),
      );
    }
  }
  return permissions;
}

/**
 * Permission check for route code that already has an authenticated user id.
 * This keeps custom workspace roles aligned with Better Auth's built-in roles
 * without relying on request-global session state.
 */
export async function hasPermissionForUser(
  userId: string,
  organizationId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  const roles = await getUserRoles(userId, organizationId);
  if (roles.some((role) => roleAllows(role, resource, action))) return true;
  return customRoleAllows(organizationId, roles, resource, action);
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
