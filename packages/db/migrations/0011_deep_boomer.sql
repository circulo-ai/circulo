CREATE TABLE "workflow_run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"timestamp" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "current_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "max_execution_time" integer;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "error" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "tags" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "resume_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "execution_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lock_id" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lock_holder" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lock_acquired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lock_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_workflow_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_run_events_workflow_idx" ON "workflow_run_events" USING btree ("workflow_id","timestamp");