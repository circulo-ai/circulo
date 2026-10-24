CREATE TABLE "agent_execution_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"request_id" text NOT NULL,
	"workflow_run_id" text,
	"model" text,
	"feature" text NOT NULL,
	"reserved_tokens" bigint NOT NULL,
	"actual_tokens" bigint,
	"status" text DEFAULT 'reserved' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_execution_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_execution_reservations" ADD CONSTRAINT "agent_execution_reservations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_reservations" ADD CONSTRAINT "agent_execution_reservations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_settings" ADD CONSTRAINT "agent_execution_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_settings" ADD CONSTRAINT "agent_execution_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_execution_reservations_idempotency_idx" ON "agent_execution_reservations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_execution_reservations_org_created_idx" ON "agent_execution_reservations" USING btree ("organization_id","created_at");