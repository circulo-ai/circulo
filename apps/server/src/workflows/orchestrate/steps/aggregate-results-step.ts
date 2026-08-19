import { db, humanApproval } from "@/db";
import { getLanguageModel } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import { Output, streamText, type UIMessageStreamWriter } from "ai";
import { eq } from "drizzle-orm";
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
  recommendations: z.array(z.string()),
});

export type AggregatedResult = z.infer<typeof aggregatedResultSchema>;

export async function aggregateResultsStep(params: {
  agentResults: AgentExecutionResult[];
  plan: ExecutionPlan;
  classification: RequestClassification;
  triggerMessages: ChatMessage[];
  pendingApprovalId?: string;
  workflowRunId?: string;
  dataStream?: UIMessageStreamWriter<ChatMessage>;
}): Promise<AggregatedResult> {
  const {
    agentResults,
    plan,
    classification,
    triggerMessages,
    pendingApprovalId,
    workflowRunId,
  } = params;

  if (pendingApprovalId && workflowRunId) {
    const approval = await db.query.humanApproval.findFirst({
      where: eq(humanApproval.id, pendingApprovalId),
    });
    if (approval && approval.workflowRunId === workflowRunId) {
      const agentOutput = agentResults
        .map((result) => result.output)
        .filter((output): output is string => Boolean(output))
        .join("\n\n");
      const approved = approval.status === "approved";
      const decisionLabel =
        approval.status === "expired"
          ? "expired"
          : approval.status === "cancelled"
            ? "cancelled"
            : approval.status === "rejected"
              ? "rejected"
              : "not approved";
      return {
        summary: approved ? "Human approval granted" : "Human approval denied",
        detailedResponse: approved
          ? `Approval granted for “${approval.title}”. The agent completed its planning step; any consequential action must still be executed by an explicitly authorized tool.\n\n${agentOutput}`
          : `The approval request was ${decisionLabel}.\n\n${approval.decisionNote ?? "No decision note was provided."}`,
        actionItems: [],
        successfulAgents: approved
          ? agentResults
              .filter((result) => result.success)
              .map((result) => result.agentName)
          : [],
        failedAgents: approved
          ? agentResults
              .filter((result) => !result.success)
              .map((result) => result.agentName)
          : agentResults.map((result) => result.agentName),
        overallSuccess: approved,
        recommendations: [],
      };
    }
  }

  // If single agent, return its result directly
  if (agentResults.length === 1) {
    const result = agentResults[0]!;
    return {
      summary: result.success
        ? `${result.agentName} completed the task`
        : `${result.agentName} failed`,
      detailedResponse: result.output || result.error || "No output",
      actionItems: [],
      successfulAgents: result.success ? [result.agentName] : [],
      failedAgents: result.success ? [] : [result.agentName],
      overallSuccess: result.success,
      recommendations: [],
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

  try {
    const result = streamText({
      model: getLanguageModel(),
      output: Output.object({ schema: aggregatedResultSchema }),
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

    let streamedText = "";
    let streamedMessageId: string | undefined;
    for await (const partial of result.partialOutputStream) {
      const nextText = partial.detailedResponse;
      if (typeof nextText !== "string" || !nextText) continue;
      const delta = nextText.startsWith(streamedText)
        ? nextText.slice(streamedText.length)
        : nextText;
      if (!delta) continue;
      streamedMessageId ??= crypto.randomUUID();
      if (streamedText.length === 0) {
        params.dataStream?.write({
          type: "text-start",
          id: streamedMessageId,
        });
      }
      params.dataStream?.write({
        type: "text-delta",
        id: streamedMessageId,
        delta,
      });
      streamedText = nextText;
    }

    const { output } = await result;
    if (streamedMessageId) {
      params.dataStream?.write({
        type: "text-end",
        id: streamedMessageId,
      });
    }

    return output;
  } catch (error) {
    console.error("Failed to aggregate agent results", error);
    return {
      summary: "Agent execution completed",
      detailedResponse: agentResults
        .map(
          (result) =>
            result.output || result.error || `${result.agentName} completed`,
        )
        .join("\n\n"),
      actionItems: [],
      successfulAgents: agentResults
        .filter((result) => result.success)
        .map((result) => result.agentName),
      failedAgents: agentResults
        .filter((result) => !result.success)
        .map((result) => result.agentName),
      overallSuccess: agentResults.every((result) => result.success),
      recommendations: [],
    };
  }
}
