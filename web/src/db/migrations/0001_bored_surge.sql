CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" json,
	"org_usage_limit" numeric,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"telemetry_enabled" boolean DEFAULT true NOT NULL,
	"email_preferences" json DEFAULT '{}' NOT NULL,
	"billing_usage_notifications_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_chat_executions" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric DEFAULT '0' NOT NULL,
	"current_usage_limit" numeric DEFAULT '10',
	"usage_limit_updated_at" timestamp DEFAULT now(),
	"current_period_cost" numeric DEFAULT '0' NOT NULL,
	"last_period_cost" numeric DEFAULT '0',
	"billed_overage_this_period" numeric DEFAULT '0' NOT NULL,
	"pro_period_cost_snapshot" numeric DEFAULT '0',
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"last_active" timestamp DEFAULT now() NOT NULL,
	"billing_blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"order_id" text NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"seats" integer DEFAULT 1,
	"amount" integer NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"fx_rate_toman_per_usd" integer,
	"fx_rate_at" timestamp,
	"fx_provider" text,
	"currency_unit" text DEFAULT 'toman',
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean,
	"seats" integer,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"metadata" json,
	CONSTRAINT "check_enterprise_metadata" CHECK (plan != 'enterprise' OR metadata IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "user_rate_limits" (
	"reference_id" text PRIMARY KEY NOT NULL,
	"sync_api_requests" integer DEFAULT 0 NOT NULL,
	"async_api_requests" integer DEFAULT 0 NOT NULL,
	"api_endpoint_requests" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"last_request_at" timestamp DEFAULT now() NOT NULL,
	"is_rate_limited" boolean DEFAULT false NOT NULL,
	"rate_limit_reset_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "wallet" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_balances" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_line_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marketplace_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_aggregates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "wallet" CASCADE;--> statement-breakpoint
DROP TABLE "credit_balances" CASCADE;--> statement-breakpoint
DROP TABLE "credit_transactions" CASCADE;--> statement-breakpoint
DROP TABLE "invoice_line_items" CASCADE;--> statement-breakpoint
DROP TABLE "invoices" CASCADE;--> statement-breakpoint
DROP TABLE "marketplace_transactions" CASCADE;--> statement-breakpoint
DROP TABLE "payment_transactions" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_plans" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "usage_aggregates" CASCADE;--> statement-breakpoint
DROP TABLE "usage_events" CASCADE;--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_provider_account_idx";--> statement-breakpoint
DROP INDEX "user_email_idx";--> statement-breakpoint
DROP INDEX "user_is_creator_idx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "email_verified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_status_created_idx" ON "payment_intents" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subscription_reference_status_idx" ON "subscription" USING btree ("reference_id","status");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "telegram_id";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "telegram_username";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "is_creator";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "creator_verified";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "total_sales";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "total_earnings";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "telegram_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "telegram_username";