import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { agent } from "./agent";
import {
  artifact,
  chat,
  chatAgent,
  chatInvitation,
  chatMember,
  message,
  suggestion,
  vote,
} from "./chat";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").default("member").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }), // Only set for organization keys
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }), // Who created the organization key
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    type: text("type").notNull().default("personal"), // 'personal' or 'organization'
    lastUsed: timestamp("last_used"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => ({
    // Ensure organization keys have a organization_id and personal keys don't
    organizationTypeCheck: check(
      "organization_type_check",
      sql`(type = 'organization' AND organization_id IS NOT NULL) OR (type = 'personal' AND organization_id IS NULL)`,
    ),
  }),
);

export const settings = pgTable("settings", {
  id: text("id").primaryKey(), // Use the user id as the key
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // One settings record per user

  // Privacy settings
  telemetryEnabled: boolean("telemetry_enabled").notNull().default(true),

  // Email preferences
  emailPreferences: json("email_preferences").notNull().default("{}"),

  // Notification preferences
  errorNotificationsEnabled: boolean("error_notifications_enabled")
    .notNull()
    .default(true),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userRateLimits = pgTable("user_rate_limits", {
  referenceId: text("reference_id").primaryKey(), // Can be userId or organizationId for pooling
  syncApiRequests: integer("sync_api_requests").notNull().default(0), // Sync API requests counter
  asyncApiRequests: integer("async_api_requests").notNull().default(0), // Async API requests counter
  apiEndpointRequests: integer("api_endpoint_requests").notNull().default(0), // External API endpoint requests counter
  windowStart: timestamp("window_start").notNull().defaultNow(),
  lastRequestAt: timestamp("last_request_at").notNull().defaultNow(),
  isRateLimited: boolean("is_rate_limited").notNull().default(false),
  rateLimitResetAt: timestamp("rate_limit_reset_at"),
});

// Relations

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
  createdAgents: many(agent),
  createdChats: many(chat),
  chatMembers: many(chatMember),
  chatInvitationsSent: many(chatInvitation, { relationName: "inviter" }),
  chatInvitationsReceived: many(chatInvitation, { relationName: "invitee" }),
  addedChatAgents: many(chatAgent),
  messages: many(message),
  documents: many(artifact),
  suggestions: many(suggestion),
  votes: many(vote),
  apiKeys: many(apiKey),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, {
    fields: [apiKey.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [apiKey.createdBy],
    references: [user.id],
    relationName: "apiKeyCreator",
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  agents: many(agent),
  chats: many(chat),
  apiKeys: many(apiKey),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

// Types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
