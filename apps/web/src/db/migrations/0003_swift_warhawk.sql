DROP TABLE "orchestration_logs" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_progress" CASCADE;--> statement-breakpoint
DROP TABLE "tools" CASCADE;--> statement-breakpoint
ALTER TABLE "chat_agents" ADD COLUMN "temperature" integer DEFAULT 70;--> statement-breakpoint
ALTER TABLE "chat_agents" DROP COLUMN "custom_temperature";