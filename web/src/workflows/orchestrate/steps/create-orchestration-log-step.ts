import { db } from "@/db";
import { orchestrationLog } from "@/db/schema/orchestration";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { AggregatedResult } from "./aggregate-results-step";
import { RequestClassification } from "./classify-request-step";
import { AgentExecutionResult } from "./execute-agent-task-step";
import { ExecutionPlan } from "./plan-agent-execution-step";

// Transform agent results to match DB schema
function transformAgentResultsForDB(results: AgentExecutionResult[]): any[] {
  return results.map((result) => ({
    agentId: result.agentId,
    agentName: result.agentName,
    task: result.task,
    success: result.success,
    output: result.output,
    error: result.error,
    startTime: result.startTime.toISOString(),
    endTime: result.endTime.toISOString(),
    durationMs: result.durationMs,
    tokenCount: result.tokenCount,
    cost: result.cost,
  }));
}

// Transform agent plan to match DB schema
function transformAgentTasksForDB(
  selectedAgents: ExecutionPlan["selectedAgents"],
): any[] {
  return selectedAgents.map((agent) => ({
    agentId: agent.agentId,
    agentName: "", // Will be populated from context if needed
    task: agent.task,
    order: agent.order,
    parallelGroup: agent.parallelGroup,
    dependsOn: agent.dependsOn,
  }));
}

export async function createOrchestrationLogStep(params: {
  chatId: string;
  messageId: string;
  triggerType: OrchestrationInput["triggerType"];
  webhookPayload?: OrchestrationInput["webhookPayload"];
  classification: RequestClassification | null;
  executionPlan: ExecutionPlan | null;
  agentResults: AgentExecutionResult[];
  finalResult: AggregatedResult | null;
  executionTimeMs: number;
  success: boolean;
  error?: string;
  errorStack?: string;
}): Promise<void> {
  "use step";

  const {
    chatId,
    messageId,
    triggerType,
    webhookPayload,
    classification,
    executionPlan,
    agentResults,
    finalResult,
    executionTimeMs,
    success,
    error,
    errorStack,
  } = params;

  // Calculate total token count and cost
  const totalTokenCount = agentResults.reduce(
    (sum, r) => sum + (r.tokenCount || 0),
    0,
  );
  const totalCost = agentResults.reduce((sum, r) => sum + (r.cost || 0), 0);

  await db.insert(orchestrationLog).values({
    chatId,
    messageId,

    // Trigger information
    triggerType,
    webhookSource: webhookPayload?.source,
    webhookEvent: webhookPayload?.event,
    webhookPayload: webhookPayload?.data,

    // Classification results
    intent: classification?.intent,
    complexity: classification?.complexity,
    domains: classification?.domains,
    requiresMultipleAgents: classification?.requiresMultipleAgents,
    estimatedSteps: classification?.estimatedSteps,
    urgency: classification?.urgency,
    keyEntities: classification?.keyEntities,

    // Execution plan
    strategy: executionPlan?.strategy,
    selectedAgentIds: executionPlan?.selectedAgents.map((a) => a.agentId),
    agentTasks: executionPlan
      ? transformAgentTasksForDB(executionPlan.selectedAgents)
      : undefined,
    reasoning: executionPlan?.reasoning,
    stopOnError: executionPlan?.stopOnError ?? false,
    fallbackAgentId: executionPlan?.fallbackAgentId,
    timeoutMinutes: executionPlan?.timeoutMinutes,

    // Execution results
    agentResults: transformAgentResultsForDB(agentResults),

    // Aggregated results
    summary: finalResult?.summary,
    detailedResponse: finalResult?.detailedResponse,
    actionItems: finalResult?.actionItems,
    recommendations: finalResult?.recommendations,
    overallSuccess: finalResult?.overallSuccess,

    // Metrics
    executionTimeMs,
    totalTokenCount: totalTokenCount > 0 ? totalTokenCount : undefined,
    totalCost: totalCost > 0 ? totalCost.toFixed(6) : undefined,

    // Status
    success,
    error,
    errorStack,

    // Timestamps
    createdAt: new Date(),
    completedAt: success ? new Date() : undefined,
  });
}
