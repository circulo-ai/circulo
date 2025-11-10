ALTER TABLE "message" ADD COLUMN "mentioned_knowledge_base_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "message_mentioned_agents_idx" ON "message" USING gin ("mentioned_agent_ids");--> statement-breakpoint
CREATE INDEX "message_mentioned_kbs_idx" ON "message" USING gin ("mentioned_knowledge_base_ids");