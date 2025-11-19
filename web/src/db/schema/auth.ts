import { DEFAULT_FREE_CREDITS } from "@/db/constants";
import {
  bigint,
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: jsonb("metadata"),
  orgUsageLimit: decimal("org_usage_limit"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
    .notNull()
    .default(0), // Storage tracking for team/enterprise
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
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

export const userStats = pgTable("user_stats", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // One record per user
  totalChatExecutions: integer("total_chat_executions").notNull().default(0),
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  totalCost: decimal("total_cost").notNull().default("0"),
  currentUsageLimit: decimal("current_usage_limit").default(
    DEFAULT_FREE_CREDITS.toString(),
  ), // Default $10 for free plan, null for team/enterprise
  usageLimitUpdatedAt: timestamp("usage_limit_updated_at").defaultNow(),
  // Billing period tracking
  currentPeriodCost: decimal("current_period_cost").notNull().default("0"), // Usage in current billing period
  lastPeriodCost: decimal("last_period_cost").default("0"), // Usage from previous billing period
  billedOverageThisPeriod: decimal("billed_overage_this_period")
    .notNull()
    .default("0"), // Amount of overage already billed via threshold billing
  // Pro usage snapshot when joining a team (to prevent double-billing)
  proPeriodCostSnapshot: decimal("pro_period_cost_snapshot").default("0"), // Snapshot of Pro usage when joining team
  // Storage tracking (for free/pro users)
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
    .notNull()
    .default(0),
  lastActive: timestamp("last_active").notNull().defaultNow(),
  billingBlocked: boolean("billing_blocked").notNull().default(false),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey(), // Use the user id as the key
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // One settings record per user

  // General settings
  theme: text("theme").notNull().default("system"),

  // Privacy settings
  telemetryEnabled: boolean("telemetry_enabled").notNull().default(true),

  // Email preferences
  emailPreferences: jsonb("email_preferences").notNull().default({}),

  // Billing usage notifications preference
  billingUsageNotificationsEnabled: boolean(
    "billing_usage_notifications_enabled",
  )
    .notNull()
    .default(true),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const environment = pgTable("environment", {
  id: text("id").primaryKey(), // Use the user id as the key
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // One environment per user
  variables: jsonb("variables").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
