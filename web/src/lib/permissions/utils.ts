import { db, organization } from "@/db";
import {
  member,
  permissions,
  type permissionTypeEnum,
  user,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PermissionType = (typeof permissionTypeEnum.enumValues)[number];

/**
 * Get the highest permission level a user has for a specific entity
 * Automatically includes ownership checks for organizations via the member table
 *
 * @param userId - The ID of the user to check permissions for
 * @param entityType - The type of entity (e.g., 'workspace', 'workflow', etc.)
 * @param entityId - The ID of the specific entity
 * @returns Promise<PermissionType | null> - The highest permission the user has for the entity, or null if none
 */
export async function getUserEntityPermissions(
  userId: string,
  entityType: string,
  entityId: string,
): Promise<PermissionType | null> {
  // For organizations, check if user is the owner via member table
  if (entityType === "organization") {
    const memberResult = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.organizationId, entityId), eq(member.userId, userId)),
      )
      .limit(1);

    if (memberResult.length > 0 && memberResult[0].role === "owner") {
      return "admin";
    }
  }

  // Check explicit permissions
  const result = await db
    .select({ permissionType: permissions.permissionType })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, userId),
        eq(permissions.entityType, entityType),
        eq(permissions.entityId, entityId),
      ),
    );

  if (result.length === 0) {
    return null;
  }

  const permissionOrder: Record<PermissionType, number> = {
    admin: 3,
    write: 2,
    read: 1,
  };

  const highestPermission = result.reduce((highest, current) => {
    return permissionOrder[current.permissionType] >
      permissionOrder[highest.permissionType]
      ? current
      : highest;
  });

  return highestPermission.permissionType;
}

/**
 * Check if a user has at least the specified permission level for an entity
 *
 * @param userId - The ID of the user to check
 * @param entityType - The type of entity
 * @param entityId - The ID of the entity
 * @param requiredPermission - The minimum required permission level
 * @returns Promise<boolean> - True if user has required permission or higher
 */
export async function hasPermission(
  userId: string,
  entityType: string,
  entityId: string,
  requiredPermission: PermissionType,
): Promise<boolean> {
  const userPermission = await getUserEntityPermissions(
    userId,
    entityType,
    entityId,
  );

  if (!userPermission) {
    return false;
  }

  const permissionOrder: Record<PermissionType, number> = {
    admin: 3,
    write: 2,
    read: 1,
  };

  return permissionOrder[userPermission] >= permissionOrder[requiredPermission];
}

/**
 * Check if a user has admin permission for a specific organization
 *
 * @param userId - The ID of the user to check
 * @param organizationId - The ID of the organization to check
 * @returns Promise<boolean> - True if the user has admin permission for the organization, false otherwise
 */
export async function hasAdminPermission(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  // Check if user is the owner via member table
  const memberResult = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);

  if (memberResult.length > 0 && memberResult[0].role === "owner") {
    return true;
  }

  // Check explicit admin permission
  const result = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, userId),
        eq(permissions.entityType, "organization"),
        eq(permissions.entityId, organizationId),
        eq(permissions.permissionType, "admin"),
      ),
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Retrieves a list of users with their associated permissions for a given organization.
 * Includes the organization owner (from member table) with admin permission.
 *
 * @param organizationId - The ID of the organization to retrieve user permissions for.
 * @returns A promise that resolves to an array of user objects, each containing user details and their permission type.
 */
export async function getUsersWithPermissions(organizationId: string) {
  // Get explicit permissions
  const explicitPermissions = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      permissionType: permissions.permissionType,
    })
    .from(permissions)
    .innerJoin(user, eq(permissions.userId, user.id))
    .where(
      and(
        eq(permissions.entityType, "organization"),
        eq(permissions.entityId, organizationId),
      ),
    );

  // Get organization owner from member table
  const ownerResult = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
    )
    .limit(1);

  // Combine results, ensuring owner is marked with admin permission
  const results: Array<{
    userId: string;
    email: string;
    name: string;
    permissionType: PermissionType;
    isOwner: boolean;
  }> = explicitPermissions.map((p) => ({ ...p, isOwner: false }));

  if (ownerResult.length > 0) {
    const owner = ownerResult[0];
    // Check if owner already has explicit permission
    const ownerIndex = results.findIndex((r) => r.userId === owner.userId);

    if (ownerIndex >= 0) {
      // Owner has explicit permission - ensure it's admin
      results[ownerIndex] = {
        ...results[ownerIndex],
        permissionType: "admin" as const,
        isOwner: true,
      };
    } else {
      // Add owner with admin permission
      results.unshift({
        userId: owner.userId,
        email: owner.email,
        name: owner.name,
        permissionType: "admin" as const,
        isOwner: true,
      });
    }
  }

  // Sort by email
  return results.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Check if a user has admin access to a specific organization
 * This is an alias for hasAdminPermission for backwards compatibility
 *
 * @param userId - The ID of the user to check
 * @param organizationId - The ID of the organization to check
 * @returns Promise<boolean> - True if the user has admin access to the organization, false otherwise
 */
export async function hasOrganizationAdminAccess(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  return hasAdminPermission(userId, organizationId);
}

/**
 * Get a list of organizations that the user can manage (owns or has admin permissions)
 *
 * @param userId - The ID of the user to check
 * @returns Promise<Array<{
 *   id: string
 *   name: string
 *   role: string
 *   accessType: 'owner' | 'admin'
 * }>> - A list of organizations that the user can manage
 */
export async function getManageableOrganizations(userId: string) {
  // Get owned organizations (where user is owner in member table)
  const owned = await db
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
    })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));

  // Get organizations with admin permissions
  const admin = await db
    .select({
      id: organization.id,
      name: organization.name,
    })
    .from(organization)
    .innerJoin(permissions, eq(permissions.entityId, organization.id))
    .where(
      and(
        eq(permissions.userId, userId),
        eq(permissions.entityType, "organization"),
        eq(permissions.permissionType, "admin"),
      ),
    );

  const ownedSet = new Set(owned.map((o) => o.id));

  return [
    ...owned.map((o) => ({ ...o, accessType: "owner" as const })),
    ...admin
      .filter((o) => !ownedSet.has(o.id))
      .map((o) => ({
        ...o,
        role: "admin" as string,
        accessType: "admin" as const,
      })),
  ];
}

/**
 * Get all entity IDs of a specific type that a user has any permission for
 * Useful for filtering queries to only show accessible entities
 *
 * @param userId - The ID of the user
 * @param entityType - The type of entity to check
 * @returns Promise<string[]> - Array of entity IDs the user can access
 */
export async function getAccessibleEntityIds(
  userId: string,
  entityType: string,
): Promise<string[]> {
  // For organizations, include organizations where user is a member with owner role
  if (entityType === "organization") {
    const [owned, permitted] = await Promise.all([
      db
        .select({ id: organization.id })
        .from(organization)
        .innerJoin(member, eq(member.organizationId, organization.id))
        .where(and(eq(member.userId, userId), eq(member.role, "owner"))),
      db
        .select({ entityId: permissions.entityId })
        .from(permissions)
        .where(
          and(
            eq(permissions.userId, userId),
            eq(permissions.entityType, entityType),
          ),
        ),
    ]);

    const ownedIds = new Set(owned.map((o) => o.id));
    const permittedIds = permitted.map((p) => p.entityId);

    return [...ownedIds, ...permittedIds.filter((id) => !ownedIds.has(id))];
  }

  // For other entity types, just check permissions
  const result = await db
    .select({ entityId: permissions.entityId })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, userId),
        eq(permissions.entityType, entityType),
      ),
    );

  return result.map((r) => r.entityId);
}
