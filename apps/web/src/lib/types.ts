import type { ArtifactKind } from "@/components/artifacts/artifact";
import type { Suggestion } from "@circulo-ai/db/schema";
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

export type WorkflowPlanStepTrace = {
  workflowId: string;
  stepId: string;
  agentId: string;
  agentName: string;
  task: string;
  strategy: "sequential" | "parallel" | "conditional" | "single";
  stepIndex: number;
  totalSteps: number;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
};

export type WorkflowTrace = {
  workflowId: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  executionTimeMs?: number;
  classification?: RequestClassification;
  plan?: ExecutionPlan;
  planSteps?: WorkflowPlanStepTrace[];
  agentLoopIteration?: number;
  agentLoopStatus?: "completed" | "blocked";
  agentLoopDecision?: string;
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
    startedAt: string;
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
  workflowPlanStep: WorkflowPlanStepTrace;
  workflowLoopStarted: {
    workflowId: string;
    maxIterations: number;
    initialStepCount: number;
  };
  workflowLoopIteration: {
    workflowId: string;
    iteration: number;
    status: "evaluating" | "executing";
    completedStepCount?: number;
    stepCount?: number;
  };
  workflowLoopDecision: {
    workflowId: string;
    iteration: number;
    decision: "complete" | "continue" | "blocked";
    reasoning: string;
    nextStepCount: number;
  };
  workflowLoopCompleted: {
    workflowId: string;
    iterations: number;
    status: "completed" | "blocked";
    reason: string;
  };
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
  dataUrl?: string;
  downloadUrl?: string;
};

export type CustomUIMessageChunk = UIMessageChunk<
  MessageMetadata,
  CustomUIDataTypes
>;
