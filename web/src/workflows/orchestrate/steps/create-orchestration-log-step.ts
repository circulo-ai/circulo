import { db } from "@/db";
import { orchestrationLog } from "@/db/schema/orchestration";
import { AggregatedResult } from "./aggregate-results-step";
import { RequestClassification } from "./classify-request-step";
import { AgentExecutionResult } from "./execute-agent-task-step";
import { ExecutionPlan } from "./plan-agent-execution-step";

export async function createOrchestrationLogStep(params: {
  chatId: string;
  messageId: string;
  classification: RequestClassification | null;
  executionPlan: ExecutionPlan | null;
  agentResults: AgentExecutionResult[];
  finalResult: AggregatedResult | null;
  executionTimeMs: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  "use step";

  const {
    chatId,
    messageId,
    classification,
    executionPlan,
    agentResults,
    finalResult,
    executionTimeMs,
    success,
    error,
  } = params;

  await db.insert(orchestrationLog).values({
    chatId,
    messageId,
    intent: classification?.intent,
    complexity: classification?.complexity,
    domains: classification?.domains,
    strategy: executionPlan?.strategy,
    selectedAgentIds: executionPlan?.selectedAgents.map((a) => a.agentId) || [],
    reasoning: executionPlan?.reasoning,
    agentResults: agentResults as any,
    summary: finalResult?.summary,
    executionTimeMs,
    success,
    error,
    createdAt: new Date(),
  });
}
