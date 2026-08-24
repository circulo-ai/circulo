import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Organization-scoped roles that extend Better Auth's built-in roles with
 * product permissions. Built-in roles remain the source of truth for their
 * default access; custom roles are evaluated by the application permission
 * service.
 */
export const workspaceRole = pgTable(
  "workspace_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_roles_org_key_idx").on(
      table.organizationId,
      table.key,
    ),
    index("workspace_roles_org_idx").on(table.organizationId),
  ],
);

export const workspaceRolePermission = pgTable(
  "workspace_role_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => workspaceRole.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_role_permissions_unique_idx").on(
      table.roleId,
      table.resource,
      table.action,
    ),
    index("workspace_role_permissions_role_idx").on(table.roleId),
  ],
);

export const workspaceRoleRelations = relations(
  workspaceRole,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [workspaceRole.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [workspaceRole.createdBy],
      references: [user.id],
    }),
    permissions: many(workspaceRolePermission),
  }),
);

export const workspaceRolePermissionRelations = relations(
  workspaceRolePermission,
  ({ one }) => ({
    role: one(workspaceRole, {
      fields: [workspaceRolePermission.roleId],
      references: [workspaceRole.id],
    }),
  }),
);

export type WorkspaceRole = typeof workspaceRole.$inferSelect;
export type WorkspaceRolePermission =
  typeof workspaceRolePermission.$inferSelect;
