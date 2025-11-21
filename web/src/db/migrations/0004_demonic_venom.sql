ALTER TABLE "agent_tool_configs"
    ALTER COLUMN "config" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "agent_tool_configs"
    ALTER COLUMN "config" SET DEFAULT '{}'::json;