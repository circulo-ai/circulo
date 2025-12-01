import { ChatMessage } from "@/lib/types";

export interface OrchestrationInput {
  messages: ChatMessage[];
  chatId: string;
  triggerType: "user_message" | "webhook_event";
  webhookPayload?: {
    source: "github" | "telegram" | "slack" | "custom";
    event: string;
    data: Record<string, unknown>;
  };
}
