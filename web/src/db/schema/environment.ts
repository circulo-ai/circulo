import { organization, user } from "@/db/schema/auth";
import { chat } from "@/db/schema/chat";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Environment variables are scoped hierarchically:
 * Organization → User → Chat
 *
 * Lower scopes override higher scopes.
 * All values should be encrypted at rest (handled by application layer).
 */

// ==================== ORGANIZATION ENVIRONMENT ====================
// Shared secrets for the entire organization
export const organizationEnvironment = pgTable(
  "organization_environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    // Key-value store for environment variables
    // Values should be encrypted by the application layer
    variables: jsonb("variables")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgIdx: uniqueIndex("org_env_org_idx").on(t.organizationId),
  }),
);

// ==================== USER ENVIRONMENT ====================
// Personal secrets for a user (overrides org-level)
export const userEnvironment = pgTable(
  "user_environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    variables: jsonb("variables")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: uniqueIndex("user_env_user_idx").on(t.userId),
  }),
);

// ==================== CHAT ENVIRONMENT ====================
// Chat-specific secrets (overrides user-level)
export const chatEnvironment = pgTable(
  "chat_environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),

    variables: jsonb("variables")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    chatIdx: uniqueIndex("chat_env_chat_idx").on(t.chatId),
  }),
);

// ==================== TYPES ====================
export type OrganizationEnvironment =
  typeof organizationEnvironment.$inferSelect;
export type UserEnvironment = typeof userEnvironment.$inferSelect;
export type ChatEnvironment = typeof chatEnvironment.$inferSelect;
