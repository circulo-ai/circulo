import { aggregateResultsStep } from "@/workflows/orchestrate/steps/aggregate-results-step";
import {
  type AgentExecutionResult,
  executeAgentTaskStep,
} from "@/workflows/orchestrate/steps/execute-agent-task-step";
import {
  type ChatContext,
  loadChatContextStep,
} from "@/workflows/orchestrate/steps/load-chat-step";
import {
  type ExecutionPlan,
  planAgentExecutionStep,
} from "@/workflows/orchestrate/steps/plan-agent-execution-step";
import type { WorkflowDefinition } from "@circulo-ai/wf";
import { complete, defineWorkflow } from "@circulo-ai/wf";
import type { RequestClassification } from "./steps/classify-request-step";
import { classifyRequestStep } from "./steps/classify-request-step";
import { type OrchestrationInput } from "./types";

export const ORCHESTRATION_WORKFLOW_NAME = "chat-orchestration";

export interface OrchestrationWorkflowState {
  input: OrchestrationInput;
  startedAt: number;
  context?: ChatContext;
  classification?: RequestClassification;
  plan?: ExecutionPlan;
  agentResults?: AgentExecutionResult[];
  finalResult?: Awaited<ReturnType<typeof aggregateResultsStep>>;
  failureReason?: string;
}

type OrchestrationWorkflowContext = Record<string, never>;

export type OrchestrationWorkflowDefinition = WorkflowDefinition<
  OrchestrationWorkflowContext,
  OrchestrationInput,
  OrchestrationWorkflowState
>;

export function createOrchestrationWorkflow(): OrchestrationWorkflowDefinition {
  return defineWorkflow<OrchestrationWorkflowContext, OrchestrationInput>()
    .name(ORCHESTRATION_WORKFLOW_NAME)
    .version(1)
    .context({})
    .maxExecutionTime(30 * 60 * 1000)
    .step<"load-chat-context", OrchestrationInput, OrchestrationWorkflowState>(
      "load-chat-context",
      {
        run: async (input) => {
          try {
            const context = await loadChatContextStep(input.chatId);
            return complete({ input, context, startedAt: Date.now() });
          } catch (error) {
            return complete({
              input,
              startedAt: Date.now(),
              failureReason: toErrorMessage(error),
            });
          }
        },
      },
    )
    .step<
      "classify-request",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("classify-request", {
      run: async (state) => {
        if (state.failureReason || !state.context) return complete(state);

        if (!state.context.chat.orchestrationEnabled) {
          return complete({
            ...state,
            failureReason: "Orchestration is disabled for this chat.",
          });
        }

        if (state.context.agents.length === 0) {
          return complete({
            ...state,
            failureReason: "No active agents are available in this chat.",
          });
        }

        const classification = await classifyRequestStep({
          inputMessages: state.input.messages,
          messages: state.context.messages,
          triggerType: state.input.triggerType,
          webhookPayload: state.input.webhookPayload,
        });

        return complete({ ...state, classification });
      },
    })
    .step<
      "plan-execution",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("plan-execution", {
      run: async (state) => {
        if (state.failureReason || !state.context || !state.classification) {
          return complete(state);
        }

        const plan = await planAgentExecutionStep({
          classification: state.classification,
          agents: state.context.agents,
          triggerMessages: state.input.messages,
          webhookPayload: state.input.webhookPayload,
        });

        if (plan.selectedAgents.length === 0) {
          return complete({
            ...state,
            plan,
            failureReason: "No suitable agents were found for this request.",
          });
        }

        return complete({ ...state, plan });
      },
    })
    .step<
      "execute-agents",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("execute-agents", {
      run: async (state, workflowContext) => {
        if (
          state.failureReason ||
          !state.context ||
          !state.plan ||
          !state.classification
        ) {
          return complete({ ...state, agentResults: [] });
        }

        const circularDependency = detectCircularDependencies(
          state.plan.selectedAgents,
        );
        if (circularDependency) {
          return complete({
            ...state,
            agentResults: [],
            failureReason: `Execution plan invalid: ${circularDependency}`,
          });
        }

        const agentResults = await executeAgentsAccordingToStrategy({
          actor: state.input.actor,
          plan: state.plan,
          context: state.context,
          webhookPayload: state.input.webhookPayload,
          workflowId: workflowContext.workflow.id,
        });

        let finalAgentResults = agentResults;
        if (
          state.plan.fallbackAgentId &&
          agentResults.every((result) => !result.success)
        ) {
          const fallbackAgent = state.plan.selectedAgents.find(
            (agent) => agent.agentId === state.plan?.fallbackAgentId,
          );

          if (fallbackAgent) {
            const fallbackResult = await executeAgentTaskStep({
              actor: state.input.actor,
              agentPlan: fallbackAgent,
              context: state.context,
              previousResults: agentResults,
              webhookPayload: state.input.webhookPayload,
              workflowId: workflowContext.workflow.id,
            });
            finalAgentResults = [...agentResults, fallbackResult];
          }
        }

        return complete({ ...state, agentResults: finalAgentResults });
      },
    })
    .step<
      "aggregate-results",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("aggregate-results", {
      run: async (state) => {
        if (
          state.failureReason ||
          !state.classification ||
          !state.plan ||
          !state.agentResults
        ) {
          return complete({
            ...state,
            finalResult: createFailureResult(
              state.failureReason ??
                "The orchestration could not be completed.",
            ),
          });
        }

        const finalResult = await aggregateResultsStep({
          agentResults: state.agentResults,
          plan: state.plan,
          classification: state.classification,
          triggerMessages: state.input.messages,
        });

        return complete({ ...state, finalResult });
      },
    })
    .build();
}

function createFailureResult(reason: string) {
  return {
    summary: reason,
    detailedResponse: reason,
    actionItems: [],
    successfulAgents: [],
    failedAgents: [],
    overallSuccess: false,
  };
}

function detectCircularDependencies(
  agents: ExecutionPlan["selectedAgents"],
): string | null {
  const agentMap = new Map(agents.map((agent) => [agent.agentId, agent]));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function visit(agentId: string, path: string[] = []): string | null {
    if (recursionStack.has(agentId)) {
      return `Circular dependency detected: ${[...path, agentId].join(" -> ")}`;
    }
    if (visited.has(agentId)) return null;

    visited.add(agentId);
    recursionStack.add(agentId);

    const agent = agentMap.get(agentId);
    for (const dependencyId of agent?.dependsOn ?? []) {
      if (!agentMap.has(dependencyId)) {
        return `Agent ${agentId} depends on non-existent agent ${dependencyId}`;
      }
      const cycle = visit(dependencyId, [...path, agentId]);
      if (cycle) return cycle;
    }

    recursionStack.delete(agentId);
    return null;
  }

  for (const agent of agents) {
    const cycle = visit(agent.agentId);
    if (cycle) return cycle;
  }

  return null;
}

async function executeAgentsAccordingToStrategy(params: {
  actor: OrchestrationInput["actor"];
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
}): Promise<AgentExecutionResult[]> {
  const { plan, context, webhookPayload, actor, workflowId } = params;

  switch (plan.strategy) {
    case "sequential":
      return executeSequential({
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
      });
    case "parallel":
      return executeParallel(actor, plan, context, webhookPayload, workflowId);
    case "conditional":
      return executeConditional(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
      );
    case "single":
      return executeSingle(actor, plan, context, webhookPayload, workflowId);
  }
}

async function executeSequential(params: {
  actor: OrchestrationInput["actor"];
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
}): Promise<AgentExecutionResult[]> {
  const { plan, context, webhookPayload, actor, workflowId } = params;
  const results: AgentExecutionResult[] = [];
  const sortedAgents = [...plan.selectedAgents].sort(
    (a, b) => a.order - b.order,
  );

  for (let index = 0; index < sortedAgents.length; index++) {
    const agentPlan = sortedAgents[index];
    if (!agentPlan) continue;
    const result = await executeAgentTaskStep({
      actor,
      agentPlan,
      context,
      previousResults: results,
      webhookPayload,
      workflowId,
    });
    results.push(result);

    if (!result.success && plan.stopOnError) {
      for (const skippedAgent of sortedAgents.slice(index + 1)) {
        results.push(
          createSkippedResult(
            skippedAgent,
            context,
            "Skipped due to previous agent failure",
          ),
        );
      }
      break;
    }
  }

  return results;
}

async function executeParallel(
  actor: OrchestrationInput["actor"],
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload: OrchestrationInput["webhookPayload"],
  workflowId: string,
): Promise<AgentExecutionResult[]> {
  const groups = new Map<number, typeof plan.selectedAgents>();
  for (const agent of plan.selectedAgents) {
    const groupId = agent.parallelGroup ?? 0;
    const group = groups.get(groupId) ?? [];
    group.push(agent);
    groups.set(groupId, group);
  }

  const results: AgentExecutionResult[] = [];
  for (const groupId of [...groups.keys()].sort((a, b) => a - b)) {
    const groupResults = await Promise.all(
      groups.get(groupId)!.map((agentPlan) =>
        executeAgentTaskStep({
          actor,
          agentPlan,
          context,
          previousResults: results,
          webhookPayload,
          workflowId,
        }),
      ),
    );
    results.push(...groupResults);
    if (plan.stopOnError && groupResults.some((result) => !result.success))
      break;
  }
  return results;
}

async function executeConditional(
  actor: OrchestrationInput["actor"],
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload: OrchestrationInput["webhookPayload"],
  workflowId: string,
): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];
  const executed = new Set<string>();
  const resultMap = new Map<string, AgentExecutionResult>();

  while (executed.size < plan.selectedAgents.length) {
    const ready = plan.selectedAgents.filter((agent) => {
      if (executed.has(agent.agentId)) return false;
      return (agent.dependsOn ?? []).every(
        (dependencyId) =>
          executed.has(dependencyId) && resultMap.get(dependencyId)?.success,
      );
    });

    if (ready.length === 0) {
      for (const agent of plan.selectedAgents.filter(
        (candidate) => !executed.has(candidate.agentId),
      )) {
        const failed = createSkippedResult(
          agent,
          context,
          "Dependencies not met",
        );
        results.push(failed);
        resultMap.set(agent.agentId, failed);
        executed.add(agent.agentId);
      }
      break;
    }

    const batchResults = await Promise.all(
      ready.map((agentPlan) =>
        executeAgentTaskStep({
          actor,
          agentPlan,
          context,
          previousResults: results,
          webhookPayload,
          workflowId,
        }),
      ),
    );

    for (const result of batchResults) {
      results.push(result);
      resultMap.set(result.agentId, result);
      executed.add(result.agentId);
    }

    if (plan.stopOnError && batchResults.some((result) => !result.success)) {
      for (const agent of plan.selectedAgents.filter(
        (candidate) => !executed.has(candidate.agentId),
      )) {
        const skipped = createSkippedResult(
          agent,
          context,
          "Stopped due to previous failure",
        );
        results.push(skipped);
        resultMap.set(agent.agentId, skipped);
        executed.add(agent.agentId);
      }
      break;
    }
  }

  return results;
}

async function executeSingle(
  actor: OrchestrationInput["actor"],
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload: OrchestrationInput["webhookPayload"],
  workflowId: string,
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];
  if (!agentPlan) return [];
  return [
    await executeAgentTaskStep({
      actor,
      agentPlan,
      context,
      previousResults: [],
      webhookPayload,
      workflowId,
    }),
  ];
}

function createSkippedResult(
  agentPlan: ExecutionPlan["selectedAgents"][number],
  context: ChatContext,
  error: string,
): AgentExecutionResult {
  const now = new Date();
  const chatAgent = context.agents.find(
    (candidate) => candidate.agentId === agentPlan.agentId,
  );
  return {
    agentId: agentPlan.agentId,
    agentName: chatAgent?.agent.name ?? "Unknown Agent",
    task: agentPlan.task,
    success: false,
    error,
    startTime: now,
    endTime: now,
    durationMs: 0,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
