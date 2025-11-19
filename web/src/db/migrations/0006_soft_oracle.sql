ALTER TABLE "chat_agent" DROP CONSTRAINT "chat_agent_unique_order_idx";--> statement-breakpoint
ALTER TABLE "chat" DROP CONSTRAINT "chat_counts_non_negative";--> statement-breakpoint
ALTER TABLE "chat_agent" DROP CONSTRAINT "chat_agent_speak_order_non_negative";--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_sender_check";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_agent" DROP CONSTRAINT "chat_agent_added_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" DROP CONSTRAINT "chat_knowledge_base_added_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "chat_member_user_pin_order_unique";--> statement-breakpoint
ALTER TABLE "environment" ALTER COLUMN "variables" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "metadata" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "email_preferences" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "email_preferences" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "chat_environment" ALTER COLUMN "variables" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "chat_environment" ALTER COLUMN "variables" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "headers" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "mcp_servers" ALTER COLUMN "headers" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_agent" ADD CONSTRAINT "chat_agent_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_base" ADD CONSTRAINT "chat_knowledge_base_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_name_idx" ON "agents" USING btree ("name");--> statement-breakpoint
ALTER TABLE "chat_agent" DROP COLUMN "speak_order";--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_unique" UNIQUE("slug");