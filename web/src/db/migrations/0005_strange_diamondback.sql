DROP INDEX "agent_tool_configs_agent_tool_idx";--> statement-breakpoint
CREATE INDEX "agent_tool_configs_agent_tool_idx" ON "agent_tool_configs" USING btree ("agent_id","tool_id");