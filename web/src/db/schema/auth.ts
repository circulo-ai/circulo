import { DEFAULT_FREE_CREDITS } from "@/db/constants";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ==================== ENUMS ====================
export const permissionTypeEnum = pgEnum("permission_type", [
  "admin",
  "write",
  "read,
]);

// ==================== CORE AUTH TABLES ====================
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
});

export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: text("active_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
    tokenIdx: index("sessions_token_idx").on(t.token)
  }),
);

export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdIdx: index("accounts_user_id_idx").on(t.userId),
    providerIdx: uniqueIndex("accounts_provider_idx").on(
      t.providerId,
      t.accountId
    )
  }),
);

export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => ({
    identifierIdx: index("verifications_identifier_idx").on(t.identifier)
  }),
);

// ==================== ORGANIZATION ====================
export const organization = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  orgUsageLimit: decimal("org_usage_limit", { precision: 10, scale: 2 }),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
    .notNull()
    .default(0),
  allowPersonalApiKeys: boolean("allow_personal_api_keys")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const member = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // 'owner', 'admin', 'member'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userOrgIdx: uniqueIndex("members_user_org_idx").on(
      t.userId,
      t.organizationId
    ),
    orgIdx: index("members_org_idx").on(t.organizationId)
  }),
);

export const invitation = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"), // pending, accepted, declined, expired
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    emailIdx: index("invitations_email_idx").on(t.email),
    orgIdx: index("invitations_org_idx").on(t.organizationId)
  }),
);

// ==================== USER SETTINGS & STATS ====================
export const userStats = pgTable("user_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  totalChatExecutions: integer("total_chat_executions").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  totalCost: decimal("total_cost", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  currentUsageLimit: decimal("current_usage_limit", {
    precision: 10,
    scale: 2
  }).default(DEFAULT_FREE_CREDITS.toString()),
  usageLimitUpdatedAt: timestamp("usage_limit_updated_at", {
    withTimezone: true
  }).defaultNow(),
  currentPeriodCost: decimal("current_period_cost", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  lastPeriodCost: decimal("last_period_cost", {
    precision: 12,
    scale: 6
  }).default("0"),
  billedOverageThisPeriod: decimal("billed_overage_this_period", {
    precision: 12,
    scale: 6
  })
    .notNull()
    .default("0"),
  proPeriodCostSnapshot: decimal("pro_period_cost_snapshot", {
    precision: 12,
    scale: 6
  }).default("0"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
    .notNull()
    .default(0),
  lastActive: timestamp("last_active", { withTimezone: true })
    .notNull()
    .defaultNow(),
  billingBlocked: boolean("billing_blocked").notNull().default(false),
});

export const settings = pgTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("system"),
  telemetryEnabled: boolean("telemetry_enabled").notNull().default(true),
  emailPreferences: jsonb("email_preferences")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  billingUsageNotificationsEnabled: boolean(
    "billing_usage_notifications_enabled",
  )
    .notNull()
    .default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

// ==================== API KEYS ====================
export const apiKey = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade"
    }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null"
    }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(), // Store hash, not plain key
    keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification
    type: text("type").notNull().default("personal"), // 'personal' | 'organization'
    lastUsed: timestamp("last_used", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdx: index("api_keys_user_idx").on(t.userId),
    orgIdx: index("api_keys_org_idx").on(t.organizationId),
    typeCheck: check(
      "api_keys_type_check",
      sql`
          (type = 'organization' AND organization_id IS NOT NULL)
          OR 
    (type = 'personal' AND organization_id IS NULL)
      `
    )
  })
);

// ==================== PERMISSIONS ====================
export const permissions = pgTable(
  "permissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // 'organization', 'chat', 'agent', etc.
    entityId: text("entity_id").notNull(),
    permissionType: permissionTypeEnum("permission_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userEntityIdx: uniqueIndex("permissions_unique").on(
      t.userId,
      t.entityType,
      t.entityId
    ),
    entityIdx: index("permissions_entity_idx").on(t.entityType, t.entityId)
  })
);

// ==================== TYPES ====================
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type PermissionType = (typeof permissionTypeEnum.enumValues)[number];
