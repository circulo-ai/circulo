import type { FileUIPart, UIMessage } from "ai";
import type { Chat, Message, Agent, ChatWithRelations } from "@/db/schema";

export interface CreateChatParams {
  title: string;
  description?: string;
  style?: "brainstorm" | "debate" | "analyze" | "custom";
  visibility?: "public" | "private";
  instructions?: string;
  agentIds?: string[];
  knowledgeBaseIds?: string[];
}

export interface SendMessageParams {
  content: string;
  files?: FileUIPart[];
  quotedMessageId?: string;
}

export interface ChatListResponse {
  data: Chat[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ChatResponse {
  data: ChatWithRelations;
}

export interface MessageResponse {
  data: {
    message: Message;
    taskId: string | null;
    warning?: string;
  };
}

export interface MessagesResponse {
  data: Message[];
}

export interface StreamEvent {
  type: 
    | "connected"
    | "heartbeat"
    | "agent_processing"
    | "agent_response"
    | "agent_error"
    | "processing_complete"
    | "processing_error"
    | "ui_message_part"
    | "balance_reserved"
    | "balance_released";
  timestamp: string;
  agentId?: string;
  agentName?: string;
  content?: string;
  fullContent?: string;
  messagePart?: UIMessage;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    cost: number;
  };
  status?: "starting" | "completed" | "failed";
  error?: string;
  totalCost?: number;
  processedAgents?: number;
  successfulAgents?: number;
}

export interface ChatStreamState {
  isConnected: boolean;
  isProcessing: boolean;
  currentAgent?: {
    id: string;
    name: string;
    status: "starting" | "processing" | "completed" | "failed";
  };
  events: StreamEvent[];
  error?: string;
}