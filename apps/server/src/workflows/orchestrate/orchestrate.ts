import { db, humanApproval, mcpIntegration, taskHandoff } from "@/db";
import { McpClient } from "@/lib/mcp/client";
import { getTextFromMessages } from "@/lib/utils";
import { aggregateResultsStep } from "@/workflows/orchestrate/steps/aggregate-results-step";
import {
  type AgentExecutionResult,
  executeAgentTaskStep,
  executeDirectResponseStep,
  flushDurableUIChunks,
  getAgentExecutionKey,
  loadDurableAgentResults,
  persistDurableAgentResult,
  toUIMessageStreamWriter,
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
import { complete, defineWorkflow, waitForAndRetry } from "@circulo-ai/wf";
import { and, asc, eq } from "drizzle-orm";
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
  workflowRunId?: string;
  pendingApprovalId?: string;
  pendingHumanHandoffId?: string;
  /** Prevents handoffs from being replayed after durable waits or recovery. */
  processedHandoffIds?: string[];
  /** Bounded self-continuation counts per agent within this workflow. */
  selfHandoffCounts?: Record<string, number>;
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
            const context = await loadChatContextStep(
              input.chatId,
              input.actor.userId,
              getTextFromMessages(input.messages),
            );
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

        if (
          !state.context.chat.orchestrationEnabled ||
          state.context.agents.length === 0
        ) {
          return complete({
            ...state,
            classification: createDirectClassification(state.input),
          });
        }

        try {
          const classification = await classifyRequestStep({
            inputMessages: state.input.messages,
            messages: state.context.messages,
            triggerType: state.input.triggerType,
            webhookPayload: state.input.webhookPayload,
            orchestrationAgent: state.context.orchestrationAgent,
            orchestrationModel: state.context.chat.orchestrationModel,
            orchestrationFallbackModel:
              state.context.chat.orchestrationFallbackModel,
          });

          return complete({ ...state, classification });
        } catch (error) {
          return complete({
            ...state,
            failureReason: `Request classification failed: ${toErrorMessage(error)}`,
          });
        }
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

        try {
          const plan = await planAgentExecutionStep({
            classification: state.classification,
            agents: state.context.agents,
            triggerMessages: state.input.messages,
            webhookPayload: state.input.webhookPayload,
            orchestrationAgent: state.context.orchestrationAgent,
            orchestrationModel: state.context.chat.orchestrationModel,
            orchestrationFallbackModel:
              state.context.chat.orchestrationFallbackModel,
          });

          return complete({ ...state, plan });
        } catch (error) {
          return complete({
            ...state,
            failureReason: `Execution planning failed: ${toErrorMessage(error)}`,
          });
        }
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

        if (
          !state.context.chat.orchestrationEnabled ||
          state.context.agents.length === 0 ||
          state.plan.selectedAgents.length === 0
        ) {
          const directResult = await executeDirectResponseStep({
            actor: state.input.actor,
            context: state.context,
            inputMessages: state.input.messages,
            workflowId: workflowContext.workflow.id,
          });
          await flushDurableUIChunks(workflowContext.workflow.id);
          return complete({
            ...state,
            agentResults: [directResult],
            workflowRunId: workflowContext.workflow.id,
          });
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

        const durableAgentResults = await loadDurableAgentResults(
          workflowContext.workflow.id,
        );
        const agentResults = await executeAgentsAccordingToStrategy({
          actor: state.input.actor,
          plan: state.plan,
          context: state.context,
          webhookPayload: state.input.webhookPayload,
          workflowId: workflowContext.workflow.id,
          durableAgentResults,
        });
        await flushDurableUIChunks(workflowContext.workflow.id);

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

        const pendingApproval = finalAgentResults.find(
          (result) => result.approvalId,
        );
        return complete({
          ...state,
          agentResults: finalAgentResults,
          workflowRunId: workflowContext.workflow.id,
          pendingApprovalId: pendingApproval?.approvalId,
        });
      },
    })
    .step<
      "execute-agent-handoffs",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("execute-agent-handoffs", {
      run: async (state, workflowContext) => {
        if (
          state.failureReason ||
          !state.context ||
          !state.workflowRunId ||
          !state.agentResults
        ) {
          return complete(state);
        }

        let agentResults = [...state.agentResults];
        let pendingApprovalId = state.pendingApprovalId;
        let pendingHumanHandoffId = state.pendingHumanHandoffId;
        let processed = 0;
        const seenHandoffIds = new Set(state.processedHandoffIds ?? []);
        const selfHandoffCounts = { ...(state.selfHandoffCounts ?? {}) };
        const maxSelfHandoffsPerAgent = 3;

        if (pendingHumanHandoffId) {
          const pendingHandoff = await db.query.taskHandoff.findFirst({
            where: eq(taskHandoff.id, pendingHumanHandoffId),
          });
          if (
            pendingHandoff &&
            (pendingHandoff.status === "pending" ||
              pendingHandoff.status === "accepted")
          ) {
            return complete({
              ...state,
              pendingHumanHandoffId,
              processedHandoffIds: [...seenHandoffIds],
              selfHandoffCounts,
            });
          }
          if (pendingHandoff) {
            agentResults.push(createHumanHandoffResult(pendingHandoff));
            seenHandoffIds.add(pendingHandoff.id);
          }
          pendingHumanHandoffId = undefined;
        }

        // Process handoffs in creation order. A pending human assignment
        // pauses the workflow and must not be bypassed by later work.
        while (!pendingHumanHandoffId && processed < 10) {
          const handoffs = await db.query.taskHandoff.findMany({
            where: eq(taskHandoff.chatId, state.input.chatId),
            orderBy: asc(taskHandoff.createdAt),
          });
          const handoff = handoffs.find(
            (candidate) =>
              !seenHandoffIds.has(candidate.id) &&
              (candidate.toAgentId || candidate.toUserId) &&
              candidate.context?.workflowRunId === state.workflowRunId &&
              (candidate.status === "pending" ||
                (candidate.status === "accepted" &&
                  candidate.context?.executionWorkflowId ===
                    workflowContext.workflow.id) ||
                candidate.status === "completed" ||
                candidate.status === "rejected" ||
                candidate.status === "cancelled"),
          );

          if (!handoff) break;
          seenHandoffIds.add(handoff.id);

          if (handoff.toUserId) {
            if (handoff.status === "pending" || handoff.status === "accepted") {
              pendingHumanHandoffId = handoff.id;
              break;
            }
            agentResults.push(createHumanHandoffResult(handoff));
            processed += 1;
            continue;
          }

          if (!handoff.toAgentId) continue;
          processed += 1;

          const storedResult = deserializeHandoffResult(
            handoff.context?.executionResult,
          );
          if (handoff.status === "completed" && storedResult) {
            agentResults.push(storedResult);
            if (!pendingApprovalId) pendingApprovalId = storedResult.approvalId;
            continue;
          }

          const target = state.context.agents.find(
            (candidate) => candidate.agentId === handoff.toAgentId,
          );
          if (!target || !target.isEnabled) {
            await db
              .update(taskHandoff)
              .set({
                status: "rejected",
                completedAt: new Date(),
                context: {
                  ...handoff.context,
                  executionError:
                    !target || !target.isEnabled
                      ? "The target agent is no longer enabled in this chat."
                      : "The target agent is not available for this handoff.",
                },
              })
              .where(eq(taskHandoff.id, handoff.id));
            continue;
          }

          const isRetryingOwnClaim =
            handoff.status === "accepted" &&
            handoff.context?.executionWorkflowId ===
              workflowContext.workflow.id;
          const claimed = isRetryingOwnClaim
            ? [handoff]
            : await db
                .update(taskHandoff)
                .set({
                  status: "accepted",
                  acceptedAt: handoff.acceptedAt ?? new Date(),
                  context: {
                    ...handoff.context,
                    executionWorkflowId: workflowContext.workflow.id,
                  },
                })
                .where(
                  and(
                    eq(taskHandoff.id, handoff.id),
                    eq(taskHandoff.status, "pending"),
                  ),
                )
                .returning();

          if (!claimed[0]) {
            const current = await db.query.taskHandoff.findFirst({
              where: eq(taskHandoff.id, handoff.id),
            });
            const retryResult = deserializeHandoffResult(
              current?.context?.executionResult,
            );
            if (current?.status === "completed" && retryResult) {
              agentResults.push(retryResult);
              if (!pendingApprovalId)
                pendingApprovalId = retryResult.approvalId;
            }
            continue;
          }

          if (handoff.fromAgentId === handoff.toAgentId) {
            const count = selfHandoffCounts[handoff.toAgentId] ?? 0;
            if (count >= maxSelfHandoffsPerAgent) {
              await db
                .update(taskHandoff)
                .set({
                  status: "rejected",
                  completedAt: new Date(),
                  context: {
                    ...handoff.context,
                    executionError: `Self-continuation limit exceeded (${maxSelfHandoffsPerAgent}) for this workflow.`,
                  },
                })
                .where(eq(taskHandoff.id, handoff.id));
              continue;
            }
            selfHandoffCounts[handoff.toAgentId] = count + 1;
          }

          const handoffPlan: ExecutionPlan["selectedAgents"][number] = {
            agentId: target.agentId,
            order: agentResults.length,
            parallelGroup: null,
            dependsOn: null,
            reason: "Executed as a task handoff from another agent.",
            task: `${handoff.task}\n\nHandoff context:\n${JSON.stringify(
              handoff.context ?? {},
              null,
              2,
            )}`,
            estimatedDuration: null,
            priority: "high",
          };
          const result = await executeAgentTaskStep({
            actor: state.input.actor,
            agentPlan: handoffPlan,
            context: state.context,
            previousResults: agentResults,
            webhookPayload: state.input.webhookPayload,
            workflowId: workflowContext.workflow.id,
          });
          agentResults.push(result);
          if (!pendingApprovalId) pendingApprovalId = result.approvalId;

          await db
            .update(taskHandoff)
            .set({
              status: "completed",
              completedAt: new Date(),
              context: {
                ...handoff.context,
                executionWorkflowId: workflowContext.workflow.id,
                executionResult: serializeHandoffResult(result),
              },
            })
            .where(eq(taskHandoff.id, handoff.id));
        }

        const remainingHandoffs = await db.query.taskHandoff.findMany({
          where: eq(taskHandoff.chatId, state.input.chatId),
          orderBy: asc(taskHandoff.createdAt),
        });
        for (const handoff of remainingHandoffs) {
          if (
            processed < 10 ||
            seenHandoffIds.has(handoff.id) ||
            handoff.status !== "pending" ||
            !handoff.toAgentId ||
            handoff.context?.workflowRunId !== state.workflowRunId
          ) {
            continue;
          }
          await db
            .update(taskHandoff)
            .set({
              status: "rejected",
              completedAt: new Date(),
              context: {
                ...handoff.context,
                executionError: "The workflow handoff limit was exceeded.",
              },
            })
            .where(eq(taskHandoff.id, handoff.id));
        }

        return complete({
          ...state,
          agentResults,
          pendingApprovalId,
          pendingHumanHandoffId,
          processedHandoffIds: [...seenHandoffIds],
          selfHandoffCounts,
        });
      },
    })
    .step<
      "await-human-approval",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("await-human-approval", {
      run: async (state) => {
        if (state.pendingHumanHandoffId) {
          const handoff = await db.query.taskHandoff.findFirst({
            where: eq(taskHandoff.id, state.pendingHumanHandoffId),
          });
          if (
            handoff &&
            (handoff.status === "pending" || handoff.status === "accepted")
          ) {
            return waitForAndRetry(5_000, state);
          }
          return complete({
            ...state,
            agentResults: handoff
              ? [
                  ...(state.agentResults ?? []),
                  createHumanHandoffResult(handoff),
                ]
              : state.agentResults,
            pendingHumanHandoffId: undefined,
          });
        }

        if (!state.pendingApprovalId) return complete(state);

        const pendingApproval = await db.query.humanApproval.findFirst({
          where: and(
            eq(humanApproval.id, state.pendingApprovalId),
            eq(humanApproval.status, "pending"),
          ),
        });

        if (!pendingApproval) {
          // The approval was decided or expired between the agent step and
          // this durable checkpoint. Continue to aggregation, which reads the
          // final decision from the database.
          return complete(state);
        }

        if (
          pendingApproval.status === "approved" &&
          pendingApproval.requestedAction.kind === "mcp_tool_call"
        ) {
          const executionResult = await executeApprovedMcpAction({
            approval: pendingApproval,
            organizationId: state.input.actor.organizationId,
          });
          return complete({
            ...state,
            agentResults: executionResult
              ? [...(state.agentResults ?? []), executionResult]
              : state.agentResults,
            pendingApprovalId: undefined,
          });
        }

        // Persist a workflow wait and rerun this checkpoint on approval or on
        // the short polling interval, so agent execution is never repeated.
        return waitForAndRetry(5_000, state);
      },
    })
    .step<
      "aggregate-results",
      OrchestrationWorkflowState,
      OrchestrationWorkflowState
    >("aggregate-results", {
      run: async (state, workflowContext) => {
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
          pendingApprovalId: state.pendingApprovalId,
          workflowRunId: state.workflowRunId,
          dataStream: toUIMessageStreamWriter(workflowContext.workflow.id),
        });
        await flushDurableUIChunks(workflowContext.workflow.id);

        return complete({ ...state, finalResult });
      },
    })
    .build();
}

async function executeApprovedMcpAction(params: {
  approval: typeof humanApproval.$inferSelect;
  organizationId: string;
}): Promise<AgentExecutionResult | null> {
  const action = params.approval.requestedAction;
  if (action.executionResult && typeof action.tool === "string") {
    const stored = action.executionResult as {
      status?: unknown;
      output?: unknown;
      error?: unknown;
    };
    const now = new Date();
    return {
      agentId: `mcp:${action.integrationId ?? "unknown"}`,
      agentName: "MCP app",
      task: `Approved MCP action: ${action.tool}`,
      success: stored.status === "completed",
      output:
        stored.status === "completed" && stored.output !== undefined
          ? typeof stored.output === "string"
            ? stored.output
            : JSON.stringify(stored.output)
          : undefined,
      error:
        stored.status === "failed"
          ? String(stored.error ?? "MCP action failed")
          : undefined,
      startTime: now,
      endTime: now,
      durationMs: 0,
    };
  }
  if (
    typeof action.integrationId !== "string" ||
    typeof action.tool !== "string" ||
    typeof action.arguments !== "object" ||
    !action.arguments ||
    Array.isArray(action.arguments)
  ) {
    throw new Error("The approved MCP action payload is invalid");
  }
  const integration = await db.query.mcpIntegration.findFirst({
    where: and(
      eq(mcpIntegration.id, action.integrationId),
      eq(mcpIntegration.organizationId, params.organizationId),
      eq(mcpIntegration.enabled, true),
      eq(mcpIntegration.status, "published"),
    ),
  });
  if (!integration)
    throw new Error("The approved MCP app is no longer available");
  const startedAt = new Date();
  try {
    const output = await new McpClient(integration).callTool(
      action.tool,
      action.arguments as Record<string, unknown>,
    );
    await db
      .update(humanApproval)
      .set({
        requestedAction: {
          ...action,
          executionResult: { status: "completed", output },
        },
      })
      .where(eq(humanApproval.id, params.approval.id));
    const endTime = new Date();
    return {
      agentId: `mcp:${integration.id}`,
      agentName: integration.name,
      task: `Approved MCP action: ${action.tool}`,
      success: true,
      output: typeof output === "string" ? output : JSON.stringify(output),
      startTime: startedAt,
      endTime,
      durationMs: endTime.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(humanApproval)
      .set({
        requestedAction: {
          ...action,
          executionResult: { status: "failed", error: errorMessage },
        },
      })
      .where(eq(humanApproval.id, params.approval.id));
    const endTime = new Date();
    return {
      agentId: `mcp:${integration.id}`,
      agentName: integration.name,
      task: `Approved MCP action: ${action.tool}`,
      success: false,
      error: errorMessage,
      startTime: startedAt,
      endTime,
      durationMs: endTime.getTime() - startedAt.getTime(),
    };
  }
}

function createDirectClassification(
  input: OrchestrationInput,
): RequestClassification {
  return {
    intent: "question",
    complexity: "simple",
    domains: [],
    requiresMultipleAgents: false,
    estimatedSteps: 1,
    urgency: "medium",
    notifyMembers: false,
    keyEntities: [],
    reasoning: "Direct assistant response mode",
  };
}

function createFailureResult(reason: string) {
  return {
    summary: reason,
    detailedResponse: reason,
    actionItems: [],
    successfulAgents: [],
    failedAgents: [],
    overallSuccess: false,
    recommendations: [],
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
      if (dependencyId === agentId) continue;
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
  durableAgentResults: Map<string, AgentExecutionResult>;
}): Promise<AgentExecutionResult[]> {
  const {
    plan,
    context,
    webhookPayload,
    actor,
    workflowId,
    durableAgentResults,
  } = params;

  switch (plan.strategy) {
    case "sequential":
      return executeSequential({
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
      });
    case "parallel":
      return executeParallel(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
      );
    case "conditional":
      return executeConditional(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
      );
    case "single":
      return executeSingle(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
      );
  }
}

async function executeSequential(params: {
  actor: OrchestrationInput["actor"];
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
  durableAgentResults: Map<string, AgentExecutionResult>;
}): Promise<AgentExecutionResult[]> {
  const {
    plan,
    context,
    webhookPayload,
    actor,
    workflowId,
    durableAgentResults,
  } = params;
  const results: AgentExecutionResult[] = [];
  const sortedAgents = [...plan.selectedAgents].sort(
    (a, b) => a.order - b.order,
  );

  for (let index = 0; index < sortedAgents.length; index++) {
    const agentPlan = sortedAgents[index];
    if (!agentPlan) continue;
    const result = await executeCheckpointedAgent({
      actor,
      agentPlan,
      context,
      previousResults: results,
      webhookPayload,
      workflowId,
      durableAgentResults,
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
  durableAgentResults: Map<string, AgentExecutionResult>,
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
        executeCheckpointedAgent({
          actor,
          agentPlan,
          context,
          previousResults: results,
          webhookPayload,
          workflowId,
          durableAgentResults,
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
  durableAgentResults: Map<string, AgentExecutionResult>,
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
        executeCheckpointedAgent({
          actor,
          agentPlan,
          context,
          previousResults: results,
          webhookPayload,
          workflowId,
          durableAgentResults,
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
  durableAgentResults: Map<string, AgentExecutionResult>,
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];
  if (!agentPlan) return [];
  return [
    await executeCheckpointedAgent({
      actor,
      agentPlan,
      context,
      previousResults: [],
      webhookPayload,
      workflowId,
      durableAgentResults,
    }),
  ];
}

async function executeCheckpointedAgent(params: {
  actor: OrchestrationInput["actor"];
  agentPlan: ExecutionPlan["selectedAgents"][number];
  context: ChatContext;
  previousResults: AgentExecutionResult[];
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
  durableAgentResults: Map<string, AgentExecutionResult>;
}): Promise<AgentExecutionResult> {
  const key = getAgentExecutionKey(params.agentPlan);
  const existing = params.durableAgentResults.get(key);
  if (existing) return existing;

  const result = await executeAgentTaskStep(params);
  await flushDurableUIChunks(params.workflowId);
  await persistDurableAgentResult(params.workflowId, key, result);
  params.durableAgentResults.set(key, result);
  return result;
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

function serializeHandoffResult(result: AgentExecutionResult) {
  return {
    ...result,
    startTime: result.startTime.toISOString(),
    endTime: result.endTime.toISOString(),
  };
}

function createHumanHandoffResult(
  handoff: typeof taskHandoff.$inferSelect,
): AgentExecutionResult {
  const startTime = handoff.acceptedAt ?? handoff.createdAt;
  const endTime = handoff.completedAt ?? new Date();
  const completionNote =
    typeof handoff.context?.completionNote === "string"
      ? handoff.context.completionNote
      : undefined;
  const success = handoff.status === "completed";

  return {
    agentId: `human:${handoff.toUserId ?? handoff.id}`,
    agentName: "Human teammate",
    task: handoff.task,
    success,
    output: success
      ? (completionNote ?? "The human teammate completed the handed-off task.")
      : undefined,
    error: success
      ? undefined
      : `The human teammate ${handoff.status} the handed-off task.`,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime.getTime() - startTime.getTime()),
  };
}

function deserializeHandoffResult(value: unknown): AgentExecutionResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<AgentExecutionResult> & {
    startTime?: unknown;
    endTime?: unknown;
  };
  if (
    typeof result.agentId !== "string" ||
    typeof result.agentName !== "string" ||
    typeof result.task !== "string" ||
    typeof result.success !== "boolean" ||
    typeof result.startTime !== "string" ||
    typeof result.endTime !== "string" ||
    typeof result.durationMs !== "number"
  ) {
    return null;
  }
  const startTime = new Date(result.startTime);
  const endTime = new Date(result.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return null;
  }
  return {
    ...result,
    startTime,
    endTime,
  } as AgentExecutionResult;
}
