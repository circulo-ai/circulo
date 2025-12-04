import { type ChatMessage } from "@/lib/types";
import { type Session } from "better-auth";

export interface OrchestrationInput {
  messages: ChatMessage[];
  chatId: string;
  triggerType: "user_message" | "webhook_event";
  session: Session;
  webhookPayload?: {
    source: "github" | "telegram" | "slack" | "custom";
    event: string;
    data: Record<string, unknown>;
  };
}
