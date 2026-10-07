import { db } from "@/db";
import { member, workspaceRole, workspaceRolePermission } from "@/db/schema";
import { adminRole, memberRole, ownerRole, statement } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import {
  getUserRole,
  hasPermissionForUser,
  isMemberOf,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { ensureWorkspaceRoleCatalog } from "@/lib/workspace-role-catalog";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

const router = createRouter();
const roleParams = z.object({ id: z.uuid() });
const memberParams = z.object({ id: z.string().trim().min(1).max(200) });
const permissionCatalog = Object.entries(statement).flatMap(
  ([resource, actions]) => actions.map((action) => ({ resource, action })),
);
const permissionKeys = new Set(
  permissionCatalog.map(({ resource, action }) => `${resource}:${action}`),
);
const permissionSchema = z.object({
  resource: z.string().trim().min(1),
  action: z.string().trim().min(1),
});
const roleBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  permissions: z.array(permissionSchema).max(100),
});

function assertPermissions(
  permissions: Array<{ resource: string; action: string }>,
) {
  const unique = new Map(
    permissions.map((permission) => [
      `${permission.resource}:${permission.action}`,
      permission,
    ]),
  );
  for (const key of unique.keys()) {
    if (!permissionKeys.has(key)) {
      throw new BadRequestError(`Unsupported permission: ${key}`);
    }
  }
  return [...unique.values()];
}

/**
 * A role manager may only create or grant permissions that the manager already
 * has. Without this check an admin could manufacture a custom role containing
 * owner-only actions and then assign it to another member.
 */
async function assertCanGrantPermissions(
  userId: string,
  organizationId: string,
  permissions: Array<{ resource: string; action: string }>,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  for (const permission of permissions) {
    if (
      !(await hasPermissionForUser(
        userId,
        organizationId,
        permission.resource,
        permission.action,
        apiKeyPermissions,
      ))
    ) {
      throw new ForbiddenError(
        `You cannot grant the ${permission.resource}:${permission.action} permission`,
      );
    }
  }
}

function getBuiltInRolePermissions(roleKey: string) {
  const role =
    roleKey === "owner"
      ? ownerRole
      : roleKey === "admin"
        ? adminRole
        : roleKey === "member"
          ? memberRole
          : undefined;
  return Object.entries(role?.statements ?? {}).flatMap(
    ([resource, actions]) => {
      const typedActions = actions as readonly string[];
      return typedActions.map((action) => ({ resource, action }));
    },
  );
}

async function getRolePermissions(roleId: string, roleKey: string) {
  const builtInPermissions = getBuiltInRolePermissions(roleKey);
  if (
    builtInPermissions.length > 0 ||
    ["owner", "admin", "member"].includes(roleKey)
  ) {
    return builtInPermissions;
  }

  const permissions = await db.query.workspaceRolePermission.findMany({
    where: eq(workspaceRolePermission.roleId, roleId),
  });
  return permissions.map(({ resource, action }) => ({ resource, action }));
}

async function requireManager(
  userId: string,
  organizationId: string,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  if (!(await isMemberOf(userId, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }
  const role = await getUserRole(userId, organizationId);
  if (
    !(await hasPermissionForUser(
      userId,
      organizationId,
      "workspace",
      "manage",
      apiKeyPermissions,
    ))
  ) {
    throw new ForbiddenError("Only workspace managers can manage roles");
  }
  return role;
}

function activeOrganization(c: {
  get: (key: "activeOrgId") => string | undefined;
}) {
  const organizationId = c.get("activeOrgId");
  if (!organizationId) throw new BadRequestError("No active organization");
  return organizationId;
}

router.get("/workspace/permissions/catalog", requireAuth, async (c) => {
  const organizationId = activeOrganization(c);
  await requireManager(c.var.user!.id, organizationId, c.var.apiKeyPermissions);
  return c.json({ permissions: permissionCatalog });
});

router.get("/workspace/roles", requireAuth, async (c) => {
  const organizationId = activeOrganization(c);
  if (!(await isMemberOf(c.var.user!.id, organizationId))) {
    throw new ForbiddenError("You don't have access to this organization");
  }
  await ensureWorkspaceRoleCatalog(organizationId, c.var.user!.id);

  const roles = await db.query.workspaceRole.findMany({
    where: eq(workspaceRole.organizationId, organizationId),
    with: { permissions: true },
    orderBy: workspaceRole.createdAt,
  });
  return c.json({
    roles,
    permissions: permissionCatalog,
  });
});

router.post(
  "/workspace/roles",
  requireAuth,
  zValidator("json", roleBody),
  async (c) => {
    const organizationId = activeOrganization(c);
    await requireManager(
      c.var.user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );
    const body = c.req.valid("json");
    const permissions = assertPermissions(body.permissions);
    await assertCanGrantPermissions(
      c.var.user!.id,
      organizationId,
      permissions,
      c.var.apiKeyPermissions,
    );
    const key = `custom_${body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}_${nanoid(6).toLowerCase()}`;

    const created = await db.transaction(async (tx) => {
      const [role] = await tx
        .insert(workspaceRole)
        .values({
          organizationId,
          key,
          name: body.name,
          description: body.description ?? null,
          createdBy: c.var.user!.id,
        })
        .returning();
      if (!role) throw new BadRequestError("Unable to create role");
      if (permissions.length) {
        await tx.insert(workspaceRolePermission).values(
          permissions.map((permission) => ({
            roleId: role.id,
            ...permission,
          })),
        );
      }
      return role;
    });
    return c.json(created, 201);
  },
);

router.patch(
  "/workspace/roles/:id",
  requireAuth,
  zValidator("param", roleParams),
  zValidator("json", roleBody),
  async (c) => {
    const organizationId = activeOrganization(c);
    await requireManager(
      c.var.user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const permissions = assertPermissions(body.permissions);
    await assertCanGrantPermissions(
      c.var.user!.id,
      organizationId,
      permissions,
      c.var.apiKeyPermissions,
    );
    const current = await db.query.workspaceRole.findFirst({
      where: and(
        eq(workspaceRole.id, id),
        eq(workspaceRole.organizationId, organizationId),
      ),
    });
    if (!current) throw new NotFoundError("Workspace role not found");
    if (current.isSystem) {
      throw new ForbiddenError("Built-in roles cannot be edited");
    }

    const updated = await db.transaction(async (tx) => {
      const [role] = await tx
        .update(workspaceRole)
        .set({
          name: body.name,
          description: body.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(workspaceRole.id, id))
        .returning();
      await tx
        .delete(workspaceRolePermission)
        .where(eq(workspaceRolePermission.roleId, id));
      if (permissions.length) {
        await tx.insert(workspaceRolePermission).values(
          permissions.map((permission) => ({
            roleId: id,
            ...permission,
          })),
        );
      }
      return role;
    });
    return c.json(updated);
  },
);

router.delete(
  "/workspace/roles/:id",
  requireAuth,
  zValidator("param", roleParams),
  async (c) => {
    const organizationId = activeOrganization(c);
    await requireManager(
      c.var.user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );
    const { id } = c.req.valid("param");
    const current = await db.query.workspaceRole.findFirst({
      where: and(
        eq(workspaceRole.id, id),
        eq(workspaceRole.organizationId, organizationId),
      ),
    });
    if (!current) throw new NotFoundError("Workspace role not found");
    if (current.isSystem) {
      throw new ForbiddenError("Built-in roles cannot be deleted");
    }
    const assigned = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.role, current.key),
        ),
      )
      .limit(1);
    if (assigned.length) {
      throw new BadRequestError(
        "Reassign all members before deleting this role",
      );
    }
    await db.delete(workspaceRole).where(eq(workspaceRole.id, id));
    return c.json({ deleted: true });
  },
);

const memberRoleBody = z.object({ roleKey: z.string().trim().min(1).max(120) });
router.patch(
  "/workspace/members/:id/role",
  requireAuth,
  zValidator("param", memberParams),
  zValidator("json", memberRoleBody),
  async (c) => {
    const organizationId = activeOrganization(c);
    const actorRole = await requireManager(
      c.var.user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );
    const { id } = c.req.valid("param");
    const { roleKey } = c.req.valid("json");
    if (roleKey === "owner" && actorRole !== "owner") {
      throw new ForbiddenError("Only the owner can assign the owner role");
    }
    const targetRole = await db.query.workspaceRole.findFirst({
      where: and(
        eq(workspaceRole.organizationId, organizationId),
        eq(workspaceRole.key, roleKey),
      ),
    });
    if (!targetRole) throw new BadRequestError("Choose a valid workspace role");
    await assertCanGrantPermissions(
      c.var.user!.id,
      organizationId,
      await getRolePermissions(targetRole.id, targetRole.key),
      c.var.apiKeyPermissions,
    );
    const existing = await db.query.member.findFirst({
      where: and(eq(member.id, id), eq(member.organizationId, organizationId)),
    });
    if (!existing) throw new NotFoundError("Workspace member not found");
    if (existing.role === "owner" && actorRole !== "owner") {
      throw new ForbiddenError("Only the owner can change the owner role");
    }
    await db.update(member).set({ role: roleKey }).where(eq(member.id, id));
    return c.json({ updated: true, roleKey });
  },
);

export default router;
