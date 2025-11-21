import { organization, user } from "@/db/schema/auth";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
export const agentVisibilityEnum = pgEnum("agent_visibility", [
  "private", // Only creator can use
  "team", // Organization members can use
  "public", // Anyone can use (future marketplace)
]);

// ==================== AGENTS ====================
// Agents belong to organizations (workspaces) for proper scope management
export const agent = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership: Organization is primary owner, userId tracks creator
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

    // Basic info
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    avatarUrl: text("avatar_url"),

    // Model configuration
    model: text("model").notNull().default("gemini-2.5-flash"),
    maxTokens: integer("max_tokens").default(1000),
    temperature: integer("temperature").default(70), // 0-100 scale

    // Visibility & status
    visibility: agentVisibilityEnum("visibility").notNull().default("team"),
    isArchived: boolean("is_archived").notNull().default(false),

    // Default attachments (IDs of tools, knowledge bases, etc.)
    defaultToolIds: jsonb("default_tool_ids").$type<string[]>().default([]),
    defaultKnowledgeBaseIds: jsonb("default_knowledge_base_ids")
      .$type<string[]>()
      .default([]),

    // Extensible metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgIdx: index("agents_org_idx").on(t.organizationId),
    creatorIdx: index("agents_creator_idx").on(t.createdBy),
    visibilityIdx: index("agents_visibility_idx").on(t.visibility),
    orgNameIdx: uniqueIndex("agents_org_name_idx").on(t.organizationId, t.name),
  }),
);

// ==================== TYPES ====================
export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;
export type AgentVisibility = (typeof agentVisibilityEnum.enumValues)[number];
