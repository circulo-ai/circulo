CREATE TYPE "public"."agent_tool_access_mode" AS ENUM('all', 'allowlist');--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tool_access_mode" "agent_tool_access_mode" DEFAULT 'all' NOT NULL;--> statement-breakpoint
UPDATE "agents" SET "tool_access_mode" = 'all';--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "tool_access_mode" SET DEFAULT 'allowlist';
