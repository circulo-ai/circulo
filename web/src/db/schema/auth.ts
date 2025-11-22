import { DEFAULT_FREE_CREDITS } from "@/db/constants";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  decimal,
  index,
  integer,
  json,
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
  "read",
]);

// ==================== CORE AUTH TABLES ====================
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  isSuperUser: boolean("is_super_user").notNull().default(false),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id").references(
      () => organization.id,
      {
        onDelete: "set null",
      },
    ),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
    tokenIdx: index("session_token_idx").on(table.token),
  }),
);

export const account = pgTable("account", {
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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ==================== ORGANIZATION ====================
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: json("metadata"),
  orgUsageLimit: decimal("org_usage_limit"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
    .notNull()
    .default(0), // Storage tracking for team/enterprise
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'admin' or 'member' - team-level permissions only
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("member_user_id_idx").on(table.userId),
    organizationIdIdx: index("member_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

export const invitation = pgTable(
  "invitation",
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
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("invitation_email_idx").on(table.email),
    organizationIdIdx: index("invitation_organization_id_idx").on(
      table.organizationId,
    ),
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
    scale: 2,
  }).default(DEFAULT_FREE_CREDITS.toString()),
  usageLimitUpdatedAt: timestamp("usage_limit_updated_at", {
    withTimezone: true,
  }).defaultNow(),
  currentPeriodCost: decimal("current_period_cost", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  lastPeriodCost: decimal("last_period_cost", {
    precision: 12,
    scale: 6,
  }).default("0"),
  billedOverageThisPeriod: decimal("billed_overage_this_period", {
    precision: 12,
    scale: 6,
  })
    .notNull()
    .default("0"),
  proPeriodCostSnapshot: decimal("pro_period_cost_snapshot", {
    precision: 12,
    scale: 6,
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
    .defaultNow(),
});

// ==================== API KEYS ====================
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
      .defaultNow(),
  },
  (t) => ({
    userEntityIdx: uniqueIndex("permissions_unique").on(
      t.userId,
      t.entityType,
      t.entityId,
    ),
    entityIdx: index("permissions_entity_idx").on(t.entityType, t.entityId),
  }),
);

// ==================== TYPES ====================
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type PermissionType = (typeof permissionTypeEnum.enumValues)[number];
