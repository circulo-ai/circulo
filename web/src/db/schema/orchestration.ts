import { chat, message } from "@/db/schema/chat";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const orchestrationLog = pgTable(
  "orchestration_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),

    // Trigger information
    triggerType: text("trigger_type"), // "user_message" | "webhook_event"
    webhookSource: text("webhook_source"), // "github" | "telegram" | "slack" | "custom"
    webhookEvent: text("webhook_event"), // e.g., "push", "pull_request", "message"
    webhookPayload: jsonb("webhook_payload").$type<Record<string, unknown>>(),

    // Classification results
    intent: text("intent"), // "question" | "task" | "analysis" | "creation" | etc.
    complexity: text("complexity"), // "simple" | "moderate" | "complex" | "multi_stage"
    domains: jsonb("domains").$type<string[]>(), // ["code", "data", "design"]
    requiresMultipleAgents: boolean("requires_multiple_agents"),
    estimatedSteps: integer("estimated_steps"),
    urgency: text("urgency"), // "low" | "medium" | "high" | "critical"
    keyEntities: jsonb("key_entities").$type<string[]>(), // ["repo:main", "file:index.ts"]

    // Execution plan
    strategy: text("strategy"), // "sequential" | "parallel" | "conditional" | "single"
    selectedAgentIds: jsonb("selected_agent_ids").$type<string[]>(),
    agentTasks: jsonb("agent_tasks").$type<
      Array<{
        agentId: string;
        agentName: string;
        task: string;
        order: number;
        parallelGroup?: number;
        dependsOn?: string[];
      }>
    >(),
    reasoning: text("reasoning"), // Why this orchestration strategy was chosen
    stopOnError: boolean("stop_on_error").notNull().default(false),
    fallbackAgentId: uuid("fallback_agent_id"),
    timeoutMinutes: integer("timeout_minutes"),

    // Execution results
    agentResults: jsonb("agent_results").$type<
      Array<{
        agentId: string;
        agentName: string;
        success: boolean;
        output: string;
        error?: string;
        startTime: string;
        endTime: string;
        durationMs: number;
        tokenCount?: number;
        cost?: number;
      }>
    >(),

    // Aggregated results
    summary: text("summary"),
    detailedResponse: text("detailed_response"),
    actionItems: jsonb("action_items").$type<string[]>(),
    recommendations: jsonb("recommendations").$type<string[]>(),
    overallSuccess: boolean("overall_success"),

    // Metrics
    executionTimeMs: integer("execution_time_ms").notNull(),
    totalTokenCount: integer("total_token_count"),
    totalCost: text("total_cost"), // Stored as string for precision

    // Status
    success: boolean("success").notNull(),
    error: text("error"),
    errorStack: text("error_stack"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("orchestration_logs_chat_idx").on(t.chatId),
    index("orchestration_logs_message_idx").on(t.messageId),
    index("orchestration_logs_created_idx").on(t.createdAt),
    index("orchestration_logs_success_idx").on(t.success),
    index("orchestration_logs_strategy_idx").on(t.strategy),
    index("orchestration_logs_trigger_idx").on(t.triggerType),
  ],
);

export const orchestrationLogRelations = relations(
  orchestrationLog,
  ({ one }) => ({
    chat: one(chat, {
      fields: [orchestrationLog.chatId],
      references: [chat.id],
    }),
    message: one(message, {
      fields: [orchestrationLog.messageId],
      references: [message.id],
    }),
  }),
);

export type OrchestrationLog = typeof orchestrationLog.$inferSelect;
export type NewOrchestrationLog = typeof orchestrationLog.$inferInsert;
