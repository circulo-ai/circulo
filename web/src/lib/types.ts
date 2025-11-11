import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { createDocument } from "./ai/tools/create-document";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { updateDocument } from "./ai/tools/update-document";
import { ArtifactKind } from "@/components/artifacts/artifact";
import type { AppUsage } from "./usage";
import { Suggestion } from "@/db";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export type ChatTools = {
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
  usage: AppUsage;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

// Narrow status type used across UI without depending on external generics
export type ChatStatus = "idle" | "submitted" | "streaming" | "error" | "ready";

// Lightweight helper types to avoid importing external generics in UI layers
export type SetMessages = (
  updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
) => void;
export type SendMessage = (...args: any[]) => Promise<void> | void;
export type Regenerate = (...args: any[]) => Promise<void> | void;
export type Stop = () => void;
export type ResumeStream = () => void;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
