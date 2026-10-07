CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"request_id" text NOT NULL,
	"workflow_run_id" text,
	"provider" text NOT NULL,
	"model" text,
	"feature" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"provider_cost" numeric(16, 8) DEFAULT '0' NOT NULL,
	"platform_cost" numeric(16, 8) DEFAULT '0' NOT NULL,
	"billable_amount" numeric(16, 8) DEFAULT '0' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "usage_events_org_created_idx" ON "usage_events" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "usage_events_request_idx" ON "usage_events" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "usage_events_workflow_idx" ON "usage_events" USING btree ("workflow_run_id");
