CREATE TYPE "public"."payment_provider" AS ENUM('sizpay');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'awaiting_payment', 'completed', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"transaction_id" text,
	"provider" "payment_provider" DEFAULT 'sizpay' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'IRR' NOT NULL,
	"provider_token" text,
	"provider_order_id" text,
	"provider_transaction_id" text,
	"provider_ref_no" text,
	"provider_trace_no" text,
	"card_number" text,
	"callback_url" text NOT NULL,
	"gateway_url" text,
	"metadata" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_user_id_idx" ON "payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_wallet_id_idx" ON "payment" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "payment_transaction_id_idx" ON "payment" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_provider_token_idx" ON "payment" USING btree ("provider_token");--> statement-breakpoint
CREATE INDEX "payment_provider_order_id_idx" ON "payment" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "payment_created_at_idx" ON "payment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_user_status_idx" ON "payment" USING btree ("user_id","status");