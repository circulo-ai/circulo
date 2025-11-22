import { sql } from "drizzle-orm";
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

export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end"),
    seats: integer("seats"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    metadata: json("metadata"),
  },
  (table) => ({
    referenceStatusIdx: index("subscription_reference_status_idx").on(
      table.referenceId,
      table.status,
    ),
    enterpriseMetadataCheck: check(
      "check_enterprise_metadata",
      sql`plan != 'enterprise' OR metadata IS NOT NULL`,
    ),
  }),
);
