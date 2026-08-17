CREATE TYPE "public"."mcp_integration_status" AS ENUM('draft', 'published', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."mcp_tool_approval_mode" AS ENUM('auto', 'prompt', 'writes', 'approve');--> statement-breakpoint
ALTER TYPE "public"."memory_scope" ADD VALUE 'user' BEFORE 'organization';--> statement-breakpoint
