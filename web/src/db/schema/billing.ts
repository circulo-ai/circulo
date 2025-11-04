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
  uniqueIndex, text, json, check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// User Subscriptions
export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    plan: text('plan').notNull(),
    referenceId: text('reference_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status'),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end'),
    seats: integer('seats'),
    trialStart: timestamp('trial_start'),
    trialEnd: timestamp('trial_end'),
    metadata: json('metadata'),
  },
  (table) => ({
    referenceStatusIdx: index('subscription_reference_status_idx').on(
      table.referenceId,
      table.status
    ),
    enterpriseMetadataCheck: check(
      'check_enterprise_metadata',
      sql`plan != 'enterprise' OR metadata IS NOT NULL`
    ),
  })
)

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
