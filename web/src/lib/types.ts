import type { ArtifactKind } from "@/components/artifacts/artifact";
import type { Suggestion } from "@/db/schema";
import { AggregatedResult } from "@/workflows/orchestrate/steps/aggregate-results-step";
import { RequestClassification } from "@/workflows/orchestrate/steps/classify-request-step";
import { AgentExecutionResult } from "@/workflows/orchestrate/steps/execute-agent-task-step";
import { ExecutionPlan } from "@/workflows/orchestrate/steps/plan-agent-execution-step";
import type { UIMessage } from "ai";
import { z } from "zod";
import type { AppUsage } from "./usage";

export type WorkflowStreamEvent =
  | {
      type: "workflow-started";
      data: { workflowId: string; chatId: string; messageId: string };
    }
  | { type: "workflow-classification"; data: RequestClassification }
  | { type: "workflow-plan"; data: ExecutionPlan }
  | {
      type: "workflow-agent-started";
      data: { agentId: string; agentName: string; task: string };
    }
  | {
      type: "workflow-agent-progress";
      data: { agentId: string; progress: string };
    }
  | { type: "workflow-agent-completed"; data: AgentExecutionResult }
  | { type: "workflow-aggregated"; data: AggregatedResult }
  | {
      type: "workflow-final-result";
      data: {
        success: boolean;
        classification: RequestClassification;
        executionPlan: ExecutionPlan;
        agentResults: AgentExecutionResult[];
        finalResult: AggregatedResult;
        executionTimeMs: number;
      };
    }
  | {
      type: "workflow-completed";
      data: { success: boolean; executionTimeMs: number };
    }
  | { type: "workflow-error"; data: { error: string; agentId?: string } };

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

  workflowStarted: { workflowId: string; chatId: string; messageId: string };
  workflowClassification: RequestClassification;
  workflowPlan: ExecutionPlan;
  workflowAgentStarted: { agentId: string; agentName: string; task: string };
  workflowAgentProgress: { agentId: string; progress: string };
  workflowAgentCompleted: AgentExecutionResult;
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
