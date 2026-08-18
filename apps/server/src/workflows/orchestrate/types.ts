import { type ChatMessage } from "@/lib/types";

export interface WorkflowActor {
  userId: string;
  organizationId: string;
}

export interface OrchestrationInput {
  messages: ChatMessage[];
  /** The durable user-message version that owns this run. */
  messageId?: string;
  chatId: string;
  triggerType: "user_message" | "webhook_event";
  actor: WorkflowActor;
  webhookPayload?: {
    source: "github" | "telegram" | "slack" | "custom";
    event: string;
    data: Record<string, unknown>;
  };
}
