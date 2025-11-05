import {
  pgTable,
  varchar,
  decimal,
  timestamp,
  boolean,
  integer,
  jsonb,
  bigint,
  index,
  uniqueIndex, text, json, check, pgEnum, primaryKey, serial, numeric
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "@/db";

export const subscriptionPlans = pgTable('subscription_plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  interval: text('interval').notNull(),
  intervalCount: integer('interval_count').notNull(),
  trialPeriodDays: integer('trial_period_days'),
  features: jsonb('features').$type<Record<string, any>>().notNull(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const subscription = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  planId: text('plan_id').notNull(),
  status: text('status').notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  subscriptionId: text('subscription_id'),
  number: text('number').notNull(),
  status: text('status').notNull(),
  subtotalAmount: numeric('subtotal_amount', { precision: 14, scale: 2 }).notNull(),
  subtotalCurrency: text('subtotal_currency').notNull(),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }),
  taxCurrency: text('tax_currency'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  totalCurrency: text('total_currency').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const usageMetrics = pgTable('usage_metrics', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull(),
  metric: text('metric').notNull(),
  unitPriceAmount: numeric('unit_price_amount', { precision: 14, scale: 2 }).notNull(),
  unitPriceCurrency: text('unit_price_currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const usageRecords = pgTable('usage_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  subscriptionId: text('subscription_id').notNull(),
  metric: text('metric').notNull(),
  quantity: integer('quantity').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const userRateLimits = pgTable('user_rate_limits', {
  referenceId: text('reference_id').primaryKey(), // Can be userId or organizationId for pooling
  syncApiRequests: integer('sync_api_requests').notNull().default(0), // Sync API requests counter
  asyncApiRequests: integer('async_api_requests').notNull().default(0), // Async API requests counter
  apiEndpointRequests: integer('api_endpoint_requests').notNull().default(0), // External API endpoint requests counter
  windowStart: timestamp('window_start').notNull().defaultNow(),
  lastRequestAt: timestamp('last_request_at').notNull().defaultNow(),
  isRateLimited: boolean('is_rate_limited').notNull().default(false),
  rateLimitResetAt: timestamp('rate_limit_reset_at'),
})
