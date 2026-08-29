import { db, workflowRunEvent } from "@/db";
import {
  orchestrationFallbackModel,
  withModelFallback,
} from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import type { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import type { OrchestrationInput } from "../types";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type AgentExecutionResult } from "./execute-agent-task-step";
import type { ExecutionPlan } from "./plan-agent-execution-step";

const agentProgressDecisionSchema = z.object({
  decision: z.enum(["complete", "continue", "blocked"]),
  reasoning: z.string(),
  nextSteps: z
    .array(
      z.object({
        agentId: z.uuid(),
        task: z.string(),
        reason: z.string(),
        priority: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(3),
});

export type AgentProgressDecision = z.infer<typeof agentProgressDecisionSchema>;

const MAX_RESULT_CHARACTERS = 12_000;
const AGENT_LOOP_DECISION_EVENT = "agent.loop.decision";

export async function loadDurableAgentProgressDecisions(
  workflowId: string,
): Promise<Map<number, AgentProgressDecision>> {
  const rows = await db
    .select()
    .from(workflowRunEvent)
    .where(eq(workflowRunEvent.workflowId, workflowId));
  const decisions = new Map<number, AgentProgressDecision>();
  for (const row of rows) {
    if (row.eventType !== AGENT_LOOP_DECISION_EVENT) continue;
    const payload = row.payload as { iteration?: unknown; decision?: unknown };
    if (typeof payload.iteration !== "number") continue;
    const parsed = agentProgressDecisionSchema.safeParse(payload.decision);
    if (parsed.success) decisions.set(payload.iteration, parsed.data);
  }
  return decisions;
}

export async function persistDurableAgentProgressDecision(
  workflowId: string,
  iteration: number,
  decision: AgentProgressDecision,
): Promise<void> {
  await db.insert(workflowRunEvent).values({
    id: crypto.randomUUID(),
    workflowId,
    timestamp: Date.now(),
    eventType: AGENT_LOOP_DECISION_EVENT,
    payload: { iteration, decision },
  });
}

export async function evaluateAgentProgressStep(params: {
  workflowId: string;
  classification: Record<string, unknown>;
  plan: ExecutionPlan;
  agents: ChatContext["agents"];
  triggerMessages: ChatMessage[];
  mentions?: OrchestrationInput["mentions"];
  previousResults: AgentExecutionResult[];
  orchestrationAgent?: { model: string; instructions: string } | null;
  orchestrationModel?: string | null;
  orchestrationFallbackModel?: string | null;
}): Promise<AgentProgressDecision> {
  const availableAgents = params.agents
    .filter((candidate) => candidate.isEnabled)
    .map((candidate) => ({
      id: candidate.agentId,
      name: candidate.agent.name,
      description: candidate.agent.description,
    }));
  const completedWork = params.previousResults.map((result) => ({
    agentId: result.agentId,
    agentName: result.agentName,
    task: result.task,
    success: result.success,
    output: (result.output ?? "").slice(0, MAX_RESULT_CHARACTERS),
    error: result.error,
  }));

  const controllerInstructions =
    params.orchestrationAgent?.instructions?.trim();
  const { output } = await withModelFallback({
    modelId: params.orchestrationAgent?.model ?? params.orchestrationModel,
    fallbackModelId:
      params.orchestrationFallbackModel ?? orchestrationFallbackModel,
    run: (model) =>
      generateText({
        model,
        output: Output.object({ schema: agentProgressDecisionSchema }),
        system: `${controllerInstructions ? `${controllerInstructions}\n\n` : ""}You are the progress controller for a durable multi-agent workflow.

Decide whether the user's goal is complete after reviewing the work already performed. Choose:
- complete: the response can be composed now and no meaningful work remains.
- continue: more work is required; select at most three enabled agents and give each a concrete next task.
- blocked: the workflow cannot make useful progress without a user decision, missing access, or missing information.

Rules:
- Never select an agent that is not in AVAILABLE AGENTS.
- Do not repeat an already completed agent/task unless the next task is materially different.
- Prefer complete when the goal is satisfied; do not create work merely to extend the loop.
- The orchestration controller can finish work about workflows, orchestration, agents, tools, MCP, planning, harness behavior, and chat coordination itself. Mark complete when that controller-owned goal is satisfied instead of routing it to a specialist.
- Never create a handoff just because another agent is available. Continue only when a distinct capability is genuinely required.
- A blocked decision must not include next steps.
- Return every schema property, including an empty nextSteps array when appropriate.

AVAILABLE AGENTS:
${JSON.stringify(availableAgents, null, 2)}

INITIAL PLAN:
${JSON.stringify(params.plan, null, 2)}

CLASSIFICATION:
${JSON.stringify(params.classification, null, 2)}`,
        prompt: `USER REQUEST:\n${getTextFromMessages(params.triggerMessages)}\n\nCOMPLETED WORK:\n${JSON.stringify(completedWork, null, 2)}\n\nChoose the next durable workflow decision.`,
      }),
  });

  const enabledAgentIds = new Set(availableAgents.map((agent) => agent.id));
  const nextSteps = output.nextSteps.filter(
    (step) =>
      enabledAgentIds.has(step.agentId) &&
      !params.previousResults.some(
        (result) =>
          result.agentId === step.agentId && result.task === step.task,
      ),
  );

  if (output.decision === "continue" && nextSteps.length === 0) {
    return {
      ...output,
      decision: "blocked",
      reasoning:
        "The controller requested more work but did not produce a new valid enabled step.",
      nextSteps: [],
    };
  }
  return { ...output, nextSteps };
}
