import type { LanguageModelUsage } from "ai";
import type { UsageData } from "tokenlens/helpers";

export interface ToolExecutionMetadata {
  toolId: string;
  toolName: string;
  toolType: string;
  executionTime: number;
  tokensUsed?: number;
  cost?: number;
  success: boolean;
  timestamp: Date;
}

// Server-merged usage: base usage + TokenLens summary + optional modelId
export type AppUsage = LanguageModelUsage &
  UsageData & { modelId?: string } & {
    // Additional metadata for tool executions
    toolExecutions?: ToolExecutionMetadata[];
  };
