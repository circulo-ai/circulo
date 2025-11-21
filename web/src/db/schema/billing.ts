import { user } from "@/db/schema/auth";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ==================== TYPES ====================
export type PlanFeatures = {
  maxMessagesPerDay: number;
  rateLimitPerMinute: number;
  maxAgents: number | null;
  maxChats: number | null;
  kbSlots: number | null;
  maxAgentsInChat: number | null;
  teamMembers?: number | null;
  dedicatedSupport?: boolean;
  customBilling?: boolean;
};

// ==================== ENUMS ====================
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "inactive",
  "canceled",
  "expired",
  "trialing",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
]);
export const invoiceTypeEnum = pgEnum("invoice_type", [
  "subscription",
  "one_time",
  "usage_based",
  "addon",
  "credit",
  "refund",
  "custom",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
  "stripe",
  "changelly",
]);

// ==================== SUBSCRIPTION PLANS ====================
export const subscriptionPlan = pgTable(
  "subscription_plans",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: varchar("description", { length: 500 }),

    usdPrice: numeric("usd_price", { precision: 10, scale: 2 }).notNull(),
    billingIntervalDays: integer("billing_interval_days").notNull().default(30),

    features: jsonb("features").$type<PlanFeatures>(),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: index("subscription_plans_slug_idx").on(t.slug,
  }),
);

// ==================== SUBSCRIPTIONS ====================
export const subscription = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlan.id, { onDelete: "restrict" }),

    status: subscriptionStatusEnum("status").notNull().default("inactive"),

    startDate: timestamp("start_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }),
    autoRenew: boolean("auto_renew").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdx: index("subscriptions_user_idx").on(t.userId),
    statusIdx: index("subscriptions_status_idx").on(t.status),
    endDateIdx: index("subscriptions_end_date_idx").on(t.endDate)
  }),
);

// ==================== SUBSCRIPTION HISTORY ====================
export const subscriptionHistory = pgTable(
  "subscription_history",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlan.id, { onDelete: "restrict" }),

    oldStatus: subscriptionStatusEnum("old_status"),
    newStatus: subscriptionStatusEnum("new_status").notNull(),

    reason: varchar("reason", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    subscriptionIdx: index("subscription_history_sub_idx").on(t.subscriptionId)
  }),
);

// ==================== INVOICES ====================
export const invoice = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(
      () => subscription.id,
      { onDelete: "set null" },
    ),

    type: invoiceTypeEnum("type").notNull().default("one_time"),
    provider: paymentProviderEnum("provider").notNull(),
    providerInvoiceId: varchar("provider_invoice_id", {
      length: 255,
    }).notNull(),

    usdAmount: numeric("usd_amount", { precision: 10, scale: 2 }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("pending"),

    description: varchar("description", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userIdx: index("invoices_user_idx").on(t.userId),
    statusIdx: index("invoices_status_idx").on(t.status),
    providerIdx: index("invoices_provider_idx").on(
      t.provider,
      t.providerInvoiceId
    ),
  }),
);

// ==================== INVOICE LINE ITEMS ====================
export const invoiceLineItem = pgTable(
  "invoice_line_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),

    description: varchar("description", { length: 500 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),

    referenceType: varchar("reference_type", { length: 100 }),
    referenceId: integer("reference_id"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("invoice_line_items_invoice_idx").on(t.invoiceId)
  }),
);

// ==================== USAGE METRICS ====================
export const usageMetric = pgTable(
  "usage_metrics",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(
      () => subscription.id,
      { onDelete: "set null" },
    ),

    metric: varchar("metric", { length: 100 }).notNull(),
    count: integer("count").notNull().default(1),

    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    userMetricPeriodIdx: uniqueIndex("usage_metrics_user_metric_period_idx").on(
      t.userId,
      t.metric,
      t.periodStart
    ),
  }),
);

// ==================== WEBHOOK LOGS ====================
export const webhookLog = pgTable(
  "webhook_logs",
  {
    id: serial("id").primaryKey(),
    provider: paymentProviderEnum("provider").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    invoiceId: varchar("invoice_id", { length: 255 }),

    payload: jsonb("payload").notNull(),
    signature: text("signature"),

    status: varchar("status", { length: 50 }).notNull(),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(1),

    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    providerIdx: index("webhook_logs_provider_idx").on(t.provider),
    statusIdx: index("webhook_logs_status_idx").on(t.status)
  }),
);

// ==================== TYPES ====================
export type SubscriptionPlan = typeof subscriptionPlan.$inferSelect;
export type Subscription = typeof subscription.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
