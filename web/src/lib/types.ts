import type { ArtifactKind } from "@/components/artifacts/artifact";
import type { Suggestion } from "@/db/schema";
import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { createDocument } from "./ai/tools/create-document";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import { saveChatMemory } from "./ai/tools/save-chat-memory";
import { searchChatMemory } from "./ai/tools/search-chat-memory";
import type { updateDocument } from "./ai/tools/update-document";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type searchChatMemoryTool = InferUITool<ReturnType<typeof searchChatMemory>>;
type saveChatMemoryTool = InferUITool<ReturnType<typeof saveChatMemory>>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export type ChatTools = {
  searchChatMemory: searchChatMemoryTool;
  saveChatMemory: saveChatMemoryTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;

  // Tool execution metrics
  "tool-execution": {
    toolId: string;
    toolName: string;
    toolType: string;
    executionTime: number;
    tokensUsed?: number;
    cost?: number;
    success: boolean;
    timestamp: string;
  };

  // Chat Memory
  "memory-id": string;
  "memory-status": "saving" | "saved";
  "memory-result": {
    id: string;
    type: string;
    content: string;
    metadata: Record<string, any>;
    score?: number;
  };
  "memory-search-results": {
    id: string;
    type: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
  }[];
  "memory-search-start": {
    query: string;
  };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
