import type { ArtifactKind, Suggestion } from "@/db/schema";
import type { UIMessage, UIMessageChunk } from "ai";
import { z } from "zod";
import type { AppUsage } from "./usage";

type RequestClassification = Record<string, unknown>;
type ExecutionPlan = Record<string, unknown>;
type AgentExecutionResult = Record<string, unknown>;
type AggregatedResult = Record<string, unknown>;

export type WorkflowToolTrace = {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  status: "completed" | "error";
};

export type WorkflowAgentTrace = {
  agentId: string;
  agentName: string;
  model?: string;
  avatarUrl?: string | null;
  task: string;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: string;
  error?: string;
  toolCalls?: WorkflowToolTrace[];
};

export type WorkflowTrace = {
  workflowId: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  executionTimeMs?: number;
  classification?: RequestClassification;
  plan?: ExecutionPlan;
  agents: WorkflowAgentTrace[];
  aggregated?: boolean;
  approvals?: Array<{
    id: string;
    title: string;
    description?: string;
    requestedAction?: Record<string, unknown>;
    status: string;
  }>;
  handoffs?: Array<{
    id: string;
    task: string;
    status: string;
    toUserId?: string | null;
    toAgentId?: string | null;
  }>;
  error?: string;
};

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = Record<string, any>;

export type SuggestionStreamData = Omit<Suggestion, "userId" | "createdAt">;

/** Minimal authenticated identity passed into server-side AI tools. */
export type ActorContext = {
  userId: string;
  organizationId?: string;
  chatId?: string;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: SuggestionStreamData;
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
  workflowStepStarted: {
    workflowId: string;
    stepId: string;
    stepName: string;
    attempt: number;
  };
  workflowStepCompleted: {
    workflowId: string;
    stepId: string;
    stepName: string;
    durationMs: number;
  };
  workflowClassification: RequestClassification;
  workflowPlan: ExecutionPlan;
  workflowAgentStarted: WorkflowAgentTrace;
  workflowAgentProgress: {
    agentId: string;
    agentName?: string;
    progress: string;
    timestamp?: string;
  };
  workflowAgentCompleted: WorkflowAgentTrace;
  workflowAggregated: AggregatedResult;
  workflowFinalResult: {
    success: boolean;
    classification: RequestClassification;
    executionPlan: ExecutionPlan;
    agentResults: AgentExecutionResult[];
    finalResult: AggregatedResult;
    executionTimeMs: number;
  };
  workflowCompleted: { success: boolean; executionTimeMs: number };
  workflowPaused: { workflowId: string };
  workflowError: { error: string; agentId?: string };
  workflowHeartbeat: { timestamp: string };
  workflowTrace: WorkflowTrace;
  workflowApprovalRequested: { id: string; title: string; status: string };
  memoryUpdated: { id: string; key: string };
  scheduledTaskCreated: { id: string; name: string; nextRunAt: string | null };
  workflowHandoffCreated: { id: string; task: string; status: string };
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
  size?: number;
};

export type CustomUIMessageChunk = UIMessageChunk<
  MessageMetadata,
  CustomUIDataTypes
>;
