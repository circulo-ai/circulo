CREATE TYPE "public"."invoice_type" AS ENUM('subscription', 'one_time', 'usage_based', 'addon', 'credit', 'refund', 'custom');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('changelly');--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"old_status" "subscription_status",
	"new_status" "subscription_status" NOT NULL,
	"reason" varchar(255),
	"metadata" jsonb,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" varchar(500),
	"usd_price" numeric(10, 2) NOT NULL,
	"billing_interval_days" integer DEFAULT 30 NOT NULL,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"invoice_id" varchar(255),
	"payload" jsonb NOT NULL,
	"signature" text,
	"status" varchar(50) NOT NULL,
	"error_message" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_methods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_features" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_limits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_schedules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_aggregates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "credits" CASCADE;--> statement-breakpoint
DROP TABLE "customers" CASCADE;--> statement-breakpoint
DROP TABLE "payment_methods" CASCADE;--> statement-breakpoint
DROP TABLE "plan_features" CASCADE;--> statement-breakpoint
DROP TABLE "plan_limits" CASCADE;--> statement-breakpoint
DROP TABLE "plans" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_schedules" CASCADE;--> statement-breakpoint
DROP TABLE "usage_aggregates" CASCADE;--> statement-breakpoint
DROP TABLE "usage_events" CASCADE;--> statement-breakpoint
DROP TABLE "webhook_events" CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_invoice_number_unique";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT "invoice_line_items_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP CONSTRAINT "invoice_line_items_usage_metric_id_usage_metrics_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP CONSTRAINT "usage_metrics_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'failed', 'expired', 'canceled');--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."invoice_status";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DATA TYPE "public"."invoice_status" USING "status"::"public"."invoice_status";--> statement-breakpoint
ALTER TABLE "subscription_history" ALTER COLUMN "old_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscription_history" ALTER COLUMN "new_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'inactive'::text;--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'canceled', 'expired', 'trialing');--> statement-breakpoint
ALTER TABLE "subscription_history" ALTER COLUMN "old_status" SET DATA TYPE "public"."subscription_status" USING "old_status"::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscription_history" ALTER COLUMN "new_status" SET DATA TYPE "public"."subscription_status" USING "new_status"::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'inactive'::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."subscription_status" USING "status"::"public"."subscription_status";--> statement-breakpoint
DROP INDEX "invoice_line_items_invoice_id_idx";--> statement-breakpoint
DROP INDEX "invoices_customer_id_idx";--> statement-breakpoint
DROP INDEX "invoices_subscription_id_idx";--> statement-breakpoint
DROP INDEX "invoices_due_date_idx";--> statement-breakpoint
DROP INDEX "invoices_invoice_number_idx";--> statement-breakpoint
DROP INDEX "subscriptions_customer_id_idx";--> statement-breakpoint
DROP INDEX "subscriptions_plan_id_idx";--> statement-breakpoint
DROP INDEX "subscriptions_provider_sub_idx";--> statement-breakpoint
DROP INDEX "subscriptions_period_end_idx";--> statement-breakpoint
DROP INDEX "usage_metrics_plan_id_idx";--> statement-breakpoint
DROP INDEX "usage_metrics_key_idx";--> statement-breakpoint
DROP INDEX "unique_plan_metric";--> statement-breakpoint
DROP INDEX "invoices_provider_invoice_idx";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "invoice_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "description" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "quantity" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subscription_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "provider_invoice_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "plan_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "usage_metrics" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "total_price" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "reference_type" varchar(100);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "reference_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "type" "invoice_type" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "provider" "payment_provider" NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "usd_amount" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "description" varchar(500);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "start_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renew" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "subscription_id" integer;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "metric" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "recorded_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "period_start" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD COLUMN "period_end" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_subscription_idx" ON "subscription_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "history_changed_at_idx" ON "subscription_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "plans_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "webhook_provider_idx" ON "webhook_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "webhook_status_idx" ON "webhook_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_created_at_idx" ON "webhook_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "line_items_reference_idx" ON "invoice_line_items" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("type");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_end_date_idx" ON "subscriptions" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "usage_user_metric_period_idx" ON "usage_metrics" USING btree ("user_id","metric","period_start");--> statement-breakpoint
CREATE INDEX "usage_subscription_idx" ON "usage_metrics" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_provider_invoice_idx" ON "invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP COLUMN "plan_id";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP COLUMN "usage_metric_id";--> statement-breakpoint
ALTER TABLE "invoice_line_items" DROP COLUMN "item_type";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "invoice_number";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "subtotal";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "tax";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "discount";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "total";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "amount_paid";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "amount_due";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "period_start";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "period_end";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "issue_date";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "voided_at";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "attempt_count";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "next_payment_attempt";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "provider_status";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "hosted_invoice_url";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "invoice_pdf_url";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "memo";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "footer";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "current_period_start";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "current_period_end";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "trial_start";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "trial_end";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "cancel_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "cancel_at_period_end";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "canceled_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "cancellation_reason";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "started_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "ended_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "provider_subscription_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "provider_status";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "custom_price";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "plan_id";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "metric_key";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "metric_name";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "unit";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "pricing_type";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "unit_price";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "package_size";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "tiers";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "reset_interval";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "provider_metric_id";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "usage_metrics" DROP COLUMN "updated_at";--> statement-breakpoint
DROP TYPE "public"."billing_interval";--> statement-breakpoint
DROP TYPE "public"."feature_type";--> statement-breakpoint
DROP TYPE "public"."limit_period";--> statement-breakpoint
DROP TYPE "public"."pricing_model";--> statement-breakpoint
DROP TYPE "public"."usage_metric_type";