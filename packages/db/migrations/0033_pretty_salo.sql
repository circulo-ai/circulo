CREATE TYPE "public"."workflow_webhook_delivery_status" AS ENUM('accepted', 'duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_webhook_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TABLE "workflow_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"event_name" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"status" "workflow_webhook_status" DEFAULT 'active' NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_delivery_status" "workflow_webhook_delivery_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"run_id" text,
	"status" "workflow_webhook_delivery_status" NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhooks" ADD CONSTRAINT "workflow_webhooks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_deliveries" ADD CONSTRAINT "workflow_webhook_deliveries_webhook_id_workflow_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."workflow_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_webhooks_org_idx" ON "workflow_webhooks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "workflow_webhooks_chat_idx" ON "workflow_webhooks" USING btree ("chat_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhook_deliveries_event_idx" ON "workflow_webhook_deliveries" USING btree ("webhook_id","event_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_deliveries_received_idx" ON "workflow_webhook_deliveries" USING btree ("webhook_id","received_at");