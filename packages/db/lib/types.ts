import type { ArtifactKind, Suggestion } from "@/db/schema";
import type { LanguageModelUsage, UIMessage, UIMessageChunk } from "ai";
import { UsageData } from "tokenlens";
import { z } from "zod";

export type AppUsage = LanguageModelUsage & UsageData & { modelId?: string };

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = Record<string, any>;

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

  workflowStarted: {
    workflowId: string;
    chatId: string;
    messages: ChatMessage[];
  };
  workflowError: { error: string; agentId?: string };
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

export type CustomUIMessageChunk = UIMessageChunk<
  MessageMetadata,
  CustomUIDataTypes
>;
