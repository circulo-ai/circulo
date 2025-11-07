CREATE TYPE "public"."billing_interval" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."feature_type" AS ENUM('boolean', 'limit', 'multiplier');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."limit_period" AS ENUM('hour', 'day', 'month', 'billing_cycle');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('flat', 'tiered', 'usage', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'paused', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."usage_metric_type" AS ENUM('per_unit', 'tiered', 'package');--> statement-breakpoint
CREATE TABLE "credits" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"remaining" numeric(10, 2) NOT NULL,
	"type" varchar(50) NOT NULL,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"billing_email" varchar(255),
	"tax_id" varchar(100),
	"address_line1" varchar(255),
	"address_line2" varchar(255),
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(2),
	"provider_customer_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"unit_price" numeric(10, 4) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"plan_id" text,
	"usage_metric_id" text,
	"item_type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text,
	"invoice_number" varchar(100),
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0',
	"discount" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"amount_due" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"issue_date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"attempt_count" integer DEFAULT 0,
	"next_payment_attempt" timestamp,
	"provider_invoice_id" varchar(255),
	"provider_status" varchar(50),
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"memo" text,
	"footer" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last4" varchar(4),
	"brand" varchar(50),
	"expiry_month" integer,
	"expiry_year" integer,
	"bank_name" varchar(255),
	"account_last4" varchar(4),
	"provider_payment_method_id" varchar(255) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"feature_key" varchar(100) NOT NULL,
	"feature_name" varchar(255) NOT NULL,
	"feature_type" "feature_type" NOT NULL,
	"boolean_value" boolean,
	"numeric_value" numeric(15, 2),
	"text_value" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"limit_key" varchar(100) NOT NULL,
	"limit_name" varchar(255) NOT NULL,
	"max_value" integer,
	"period" "limit_period" DEFAULT 'month',
	"soft_limit" integer,
	"soft_limit_warning" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(100) NOT NULL,
	"pricing_model" "pricing_model" DEFAULT 'flat' NOT NULL,
	"base_price" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"billing_interval" "billing_interval",
	"interval_count" integer DEFAULT 1,
	"trial_days" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"provider_plan_id" varchar(255),
	"provider_product_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"executed_at" timestamp,
	"action" varchar(50) NOT NULL,
	"target_plan_id" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"cancellation_reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"provider_subscription_id" varchar(255),
	"provider_status" varchar(50),
	"custom_price" numeric(10, 2),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_aggregates" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"quantity" numeric(15, 4) DEFAULT '0' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp,
	"last_reset" timestamp,
	"aggregation_period" varchar(20) DEFAULT 'month' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"event_type" varchar(100),
	"idempotency_key" varchar(255),
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"metric_name" varchar(255) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"pricing_type" "usage_metric_type" NOT NULL,
	"unit_price" numeric(10, 4),
	"package_size" integer,
	"tiers" jsonb,
	"reset_interval" varchar(50),
	"provider_metric_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" varchar(50) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "payment_intents" CASCADE;--> statement-breakpoint
DROP TABLE "subscription" CASCADE;--> statement-breakpoint
DROP TABLE "user_rate_limits" CASCADE;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_usage_metric_id_usage_metrics_id_fk" FOREIGN KEY ("usage_metric_id") REFERENCES "public"."usage_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_schedules" ADD CONSTRAINT "subscription_schedules_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_schedules" ADD CONSTRAINT "subscription_schedules_target_plan_id_plans_id_fk" FOREIGN KEY ("target_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credits_customer_id_idx" ON "credits" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "credits_expires_at_idx" ON "credits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_provider_customer_idx" ON "customers" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_id_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_due_date_idx" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoices_provider_invoice_idx" ON "invoices" USING btree ("provider_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "payment_methods_customer_id_idx" ON "payment_methods" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_methods_provider_pm_idx" ON "payment_methods" USING btree ("provider_payment_method_id");--> statement-breakpoint
CREATE INDEX "plan_features_plan_id_idx" ON "plan_features" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_features_key_idx" ON "plan_features" USING btree ("feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_plan_feature" ON "plan_features" USING btree ("plan_id","feature_key");--> statement-breakpoint
CREATE INDEX "plan_limits_plan_id_idx" ON "plan_limits" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_limits_key_idx" ON "plan_limits" USING btree ("limit_key");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_plan_limit" ON "plan_limits" USING btree ("plan_id","limit_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_idx" ON "plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plans_provider_plan_idx" ON "plans" USING btree ("provider_plan_id");--> statement-breakpoint
CREATE INDEX "subscription_schedules_subscription_id_idx" ON "subscription_schedules" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_schedules_scheduled_at_idx" ON "subscription_schedules" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "subscription_schedules_status_idx" ON "subscription_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_id_idx" ON "subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_provider_sub_idx" ON "subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_aggregates_sub_metric_period_idx" ON "usage_aggregates" USING btree ("subscription_id","metric_key","aggregation_period","period_start");--> statement-breakpoint
CREATE INDEX "usage_aggregates_customer_id_idx" ON "usage_aggregates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "usage_aggregates_period_idx" ON "usage_aggregates" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_events_subscription_id_idx" ON "usage_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "usage_events_customer_id_idx" ON "usage_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "usage_events_metric_key_idx" ON "usage_events" USING btree ("metric_key");--> statement-breakpoint
CREATE INDEX "usage_events_timestamp_idx" ON "usage_events" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_idempotency_idx" ON "usage_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "usage_metrics_plan_id_idx" ON "usage_metrics" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "usage_metrics_key_idx" ON "usage_metrics" USING btree ("metric_key");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_plan_metric" ON "usage_metrics" USING btree ("plan_id","metric_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");