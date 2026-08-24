import { db } from "@/db";
import { workspaceRole, workspaceRolePermission } from "@/db/schema";
import { adminRole, memberRole, ownerRole } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

const SYSTEM_ROLES = [
  {
    key: "owner",
    name: "Owner",
    description: "Full workspace control.",
    role: ownerRole,
  },
  {
    key: "admin",
    name: "Admin",
    description: "Operational workspace management.",
    role: adminRole,
  },
  {
    key: "member",
    name: "Member",
    description: "Collaborative chat access.",
    role: memberRole,
  },
] as const;

type RoleStatements = Record<string, readonly string[]>;

export async function ensureWorkspaceRoleCatalog(
  organizationId: string,
  createdBy: string,
) {
  for (const definition of SYSTEM_ROLES) {
    const existing = await db.query.workspaceRole.findFirst({
      where: and(
        eq(workspaceRole.organizationId, organizationId),
        eq(workspaceRole.key, definition.key),
      ),
      with: { permissions: true },
    });
    let role = existing;
    if (!role) {
      const [inserted] = await db
        .insert(workspaceRole)
        .values({
          organizationId,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          isSystem: true,
          createdBy,
        })
        .onConflictDoNothing({
          target: [workspaceRole.organizationId, workspaceRole.key],
        })
        .returning();
      if (inserted) {
        role = { ...inserted, permissions: [] };
      } else {
        role = await db.query.workspaceRole.findFirst({
          where: and(
            eq(workspaceRole.organizationId, organizationId),
            eq(workspaceRole.key, definition.key),
          ),
          with: { permissions: true },
        });
      }
    }
    if (!role) continue;
    const statements = definition.role.statements as RoleStatements;
    const permissions = Object.entries(statements).flatMap(
      ([resource, actions]) =>
        actions
          .filter(
            (action) =>
              !role?.permissions?.some(
                (existing) =>
                  existing.resource === resource && existing.action === action,
              ),
          )
          .map((action) => ({ roleId: role.id, resource, action })),
    );
    if (permissions.length) {
      await db
        .insert(workspaceRolePermission)
        .values(permissions)
        .onConflictDoNothing();
    }
  }
}
