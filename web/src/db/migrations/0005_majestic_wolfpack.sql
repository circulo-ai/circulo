CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"model" varchar(100) DEFAULT 'gemini-2.5-flash' NOT NULL,
	"max_output_tokens" integer DEFAULT 1000,
	"temperature" integer DEFAULT 70,
	"avatar_url" text,
	"default_tools" jsonb DEFAULT '[]'::jsonb,
	"default_mcp_servers" jsonb DEFAULT '[]'::jsonb,
	"default_knowledge_bases" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_template" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent" CASCADE;--> statement-breakpoint
DROP TABLE "agent_template" CASCADE;--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_share_link_unique";--> statement-breakpoint
ALTER TABLE "chat_agent" DROP CONSTRAINT "chat_agent_unique_order_idx";--> statement-breakpoint
ALTER TABLE "chat_agent" DROP CONSTRAINT "chat_agent_agent_id_agent_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_memories" DROP CONSTRAINT "chat_memories_agent_id_agent_id_fk";
--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_agent_id_agent_id_fk";
--> statement-breakpoint
DROP INDEX "chat_share_link_idx";--> statement-breakpoint
DROP INDEX "chat_agent_chat_order_idx";--> statement-breakpoint
DROP INDEX "message_user_id_idx";--> statement-breakpoint
DROP INDEX "message_agent_id_idx";--> statement-breakpoint
ALTER TABLE "chat_agent" ALTER COLUMN "speak_order" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "chat_agent" ALTER COLUMN "speak_order" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "orchestration_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "author_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_author_id_idx" ON "message" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "style";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "share_link";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "link_enabled";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "message_count";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "member_count";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "total_tokens";--> statement-breakpoint
ALTER TABLE "chat" DROP COLUMN "total_cost";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_unique_order_idx" UNIQUE("chat_id");