CREATE TABLE "workflow_progress" (
	"chat_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"current_agent" varchar(255),
	"completed_agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_agents" integer NOT NULL,
	"progress" integer NOT NULL,
	"estimated_time_remaining" integer,
	"last_update" timestamp NOT NULL,
	CONSTRAINT "workflow_progress_chat_id_message_id_pk" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
CREATE INDEX "idx_workflow_progress_chat" ON "workflow_progress" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_progress_updated" ON "workflow_progress" USING btree ("last_update");