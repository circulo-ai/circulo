import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { RequestClassification } from "./classify-request-step";
import type { AgentExecutionResult } from "./execute-agent-task-step";
import type { ExecutionPlan } from "./plan-agent-execution-step";

const aggregatedResultSchema = z.object({
  summary: z.string().describe("Concise summary of what was accomplished"),
  detailedResponse: z
    .string()
    .describe("Full response synthesizing all agent outputs"),
  actionItems: z.array(z.string()).describe("Follow-up actions if any"),
  successfulAgents: z.array(z.string()),
  failedAgents: z.array(z.string()),
  overallSuccess: z.boolean(),
  recommendations: z.array(z.string()).optional(),
});

export type AggregatedResult = z.infer<typeof aggregatedResultSchema>;

export async function aggregateResultsStep(params: {
  agentResults: AgentExecutionResult[];
  plan: ExecutionPlan;
  classification: RequestClassification;
  triggerMessages: ChatMessage[];
}): Promise<AggregatedResult> {
  "use step";

  const { agentResults, plan, classification, triggerMessages } = params;

  // If single agent, return its result directly
  if (agentResults.length === 1) {
    const result = agentResults[0];
    return {
      summary: result.success
        ? `${result.agentName} completed the task`
        : `${result.agentName} failed`,
      detailedResponse: result.output || result.error || "No output",
      actionItems: [],
      successfulAgents: result.success ? [result.agentName] : [],
      failedAgents: result.success ? [] : [result.agentName],
      overallSuccess: result.success,
    };
  }

  // Aggregate multiple agent results
  const agentOutputs = agentResults
    .map(
      (r) => `${r.agentName} (${r.success ? "✓" : "✗"}):
${r.success ? r.output || "Completed" : `ERROR: ${r.error}`}
Duration: ${r.durationMs}ms`,
    )
    .join("\n\n---\n\n");

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: aggregatedResultSchema,
    system: `You are synthesizing the outputs from multiple AI agents into a coherent final response.

ORIGINAL REQUEST: "${getTextFromMessages(triggerMessages)}"
REQUEST TYPE: ${classification.intent}
EXECUTION STRATEGY: ${plan.strategy}

Your task:
1. Synthesize all agent outputs into a clear, actionable response
2. Identify what was successfully accomplished
3. Note any failures or issues
4. Provide actionable next steps if needed
5. Give recommendations for improvements

Be concise but comprehensive. The user should understand exactly what happened and what to do next.`,
    prompt: `AGENT OUTPUTS:
${agentOutputs}

Synthesize these results into a final response.`,
  });

  return object;
}
