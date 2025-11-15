// src/db/schema/billing.ts
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  varchar,
  text
} from "drizzle-orm/pg-core";
import { user } from "@/db";

// -------------------- TYPES --------------------

export type PlanFeatures = {
  maxMessagesPerDay: number;
  rateLimitPerMinute: number;
  maxAgents: number | null; // null = unlimited
  maxChats: number | null;
  kbSlots: number | null;
  maxAgentsInChat: number | null;
  teamMembers?: number | null;
  dedicatedSupport?: boolean;
  customBilling?: boolean;
};
// -------------------- ENUMS --------------------

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

export const paymentProviderEnum = pgEnum("payment_provider", [
  "changelly",
]);

// -------------------- SUBSCRIPTION PLANS --------------------

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 500 }),

  // Pricing
  usdPrice: numeric("usd_price", { precision: 10, scale: 2 }).notNull(),
  billingIntervalDays: integer("billing_interval_days").notNull().default(30),

  features: jsonb('features').$type<PlanFeatures>(),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("plans_slug_idx").on(table.slug),
}));

// -------------------- SUBSCRIPTIONS --------------------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),

    status: subscriptionStatusEnum("status").notNull().default("inactive"),

    startDate: timestamp("start_date").notNull().defaultNow(),
    endDate: timestamp("end_date"), // null = no end date
    autoRenew: boolean("auto_renew").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("subscriptions_user_idx").on(table.userId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
    endDateIdx: index("subscriptions_end_date_idx").on(table.endDate),
  }),
);

// -------------------- SUBSCRIPTION HISTORY --------------------

export const subscriptionHistory = pgTable(
  "subscription_history",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),

    oldStatus: subscriptionStatusEnum("old_status"),
    newStatus: subscriptionStatusEnum("new_status").notNull(),

    reason: varchar("reason", { length: 255 }), // upgrade, downgrade, canceled, expired
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    changedAt: timestamp("changed_at").notNull().defaultNow(),
  },
  (table) => ({
    subscriptionIdx: index("history_subscription_idx").on(table.subscriptionId),
    changedAtIdx: index("history_changed_at_idx").on(table.changedAt),
  }),
);

// -------------------- INVOICE TYPES --------------------

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "subscription",      // Recurring subscription payment
  "one_time",         // One-time purchase
  "usage_based",      // Pay-as-you-go usage charges
  "addon",            // Add-on features
  "credit",           // Account credit purchase
  "refund",           // Refund (negative amount)
  "custom",           // Custom/manual invoice
]);

// -------------------- INVOICES --------------------

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Optional subscription reference (only for subscription-related invoices)
    subscriptionId: integer("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),

    type: invoiceTypeEnum("type").notNull().default("one_time"),

    // TODO: maybe no provider is needed and we need another payment table
    provider: paymentProviderEnum("provider").notNull(),
    providerInvoiceId: varchar("provider_invoice_id", { length: 255 }).notNull(),

    usdAmount: numeric("usd_amount", { precision: 10, scale: 2 }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("pending"),

    description: varchar("description", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
    failedAt: timestamp("failed_at"),
    dueDate: timestamp("due_date"),
    // Add expire date maybe to cleanup invoices
  },
  (table) => ({
    providerInvoiceIdx: index("invoices_provider_invoice_idx").on(
      table.provider,
      table.providerInvoiceId
    ),
    userIdx: index("invoices_user_idx").on(table.userId),
    subscriptionIdx: index("invoices_subscription_idx").on(table.subscriptionId),
    typeIdx: index("invoices_type_idx").on(table.type),
    statusIdx: index("invoices_status_idx").on(table.status),
  }),
);

// -------------------- INVOICE LINE ITEMS --------------------

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    description: varchar("description", { length: 500 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),

    // Optional reference to what's being invoiced
    referenceType: varchar("reference_type", { length: 100 }), // 'plan', 'addon', 'usage', etc.
    referenceId: integer("reference_id"), // ID of the referenced item

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    invoiceIdx: index("line_items_invoice_idx").on(table.invoiceId),
    referenceIdx: index("line_items_reference_idx").on(table.referenceType, table.referenceId),
  }),
);

// -------------------- USAGE METRICS --------------------

export const usageMetrics = pgTable(
  "usage_metrics",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id")
      .references(() => subscriptions.id, { onDelete: "set null" }),

    metric: varchar("metric", { length: 100 }).notNull(), // api_calls, chat_messages, etc.
    count: integer("count").notNull().default(1),

    // Time-based tracking
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
  },
  (table) => ({
    userMetricPeriodIdx: index("usage_user_metric_period_idx").on(
      table.userId,
      table.metric,
      table.periodStart
    ),
    subscriptionIdx: index("usage_subscription_idx").on(table.subscriptionId),
  }),
);

export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  provider: paymentProviderEnum("provider").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  invoiceId: varchar("invoice_id", { length: 255 }),
  payload: jsonb("payload").notNull(),
  signature: text("signature"),
  status: varchar("status", { length: 50 }).notNull(), // 'success', 'failed', 'pending'
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(1),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  providerIdx: index("webhook_provider_idx").on(table.provider),
  statusIdx: index("webhook_status_idx").on(table.status),
  createdAtIdx: index("webhook_created_at_idx").on(table.createdAt),
}));

// -------------------- RELATIONS --------------------

export const subscriptionPlansRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    subscriptions: many(subscriptions),
    history: many(subscriptionHistory),
  })
);

export const subscriptionRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    user: one(user, {
      fields: [subscriptions.userId],
      references: [user.id]
    }),
    plan: one(subscriptionPlans, {
      fields: [subscriptions.planId],
      references: [subscriptionPlans.id],
    }),
    invoices: many(invoices),
    history: many(subscriptionHistory),
    usageMetrics: many(usageMetrics),
  }),
);

export const subscriptionHistoryRelations = relations(
  subscriptionHistory,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionHistory.subscriptionId],
      references: [subscriptions.id],
    }),
    plan: one(subscriptionPlans, {
      fields: [subscriptionHistory.planId],
      references: [subscriptionPlans.id],
    }),
  })
);

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  user: one(user, {
    fields: [invoices.userId],
    references: [user.id]
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const usageRelations = relations(usageMetrics, ({ one }) => ({
  user: one(user, {
    fields: [usageMetrics.userId],
    references: [user.id]
  }),
  subscription: one(subscriptions, {
    fields: [usageMetrics.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
