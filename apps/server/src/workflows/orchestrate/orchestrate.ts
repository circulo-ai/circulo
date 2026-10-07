import { db, humanApproval, mcpIntegration, taskHandoff } from "@/db";
import { McpClient } from "@/lib/mcp/client";
import type { WorkflowPlanStepTrace } from "@/lib/types";
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
import {
  hasExplicitAgentDirective,
  hasExplicitToolDirective,
  shouldEngageAgents,
  shouldUseControllerDirectly,
} from "./agent-engagement";
import {
  addAgentTasks,
  type AgentTaskDescriptor,
  type AgentTaskLedgerEntry,
  loadDurableAgentLoopSnapshots,
  markAgentTasksRunning,
  markUnfinishedAgentTasksBlocked,
  persistDurableAgentLoopSnapshot,
  recordAgentTaskResults,
} from "./agent-loop-state";
import type { OrchestrationAgentProfile } from "./orchestration-agent-profile";
import type { RequestClassification } from "./steps/classify-request-step";
import { classifyRequestStep } from "./steps/classify-request-step";
import {
  evaluateAgentProgressStep,
  loadDurableAgentProgressDecisions,
  persistDurableAgentProgressDecision,
} from "./steps/evaluate-agent-progress-step";
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
  /** Durable summary of the model-directed execution loop. */
  agentLoopIteration?: number;
  agentLoopStatus?: "completed" | "blocked";
  agentLoopDecision?: string;
  agentLoopPlanSteps?: WorkflowPlanStepTrace[];
  /** Durable ledger of every planned dynamic task and its observed outcome. */
  agentTaskLedger?: AgentTaskLedgerEntry[];
  finalResult?: Awaited<ReturnType<typeof aggregateResultsStep>>;
  failureReason?: string;
  /** A human-only conversation turn completed without an agent response. */
  silent?: boolean;
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
              input.actor.apiKeyPermissions,
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
            classification: createDirectClassification(
              state.input,
              state.context.agents,
            ),
          });
        }

        try {
          const classification = await classifyRequestStep({
            userId: state.input.actor.userId,
            inputMessages: state.input.messages,
            messages: state.context.messages,
            triggerType: state.input.triggerType,
            webhookPayload: state.input.webhookPayload,
            orchestrationAgent: state.context.orchestrationAgent,
            orchestrationModel: state.context.chat.orchestrationModel,
            orchestrationFallbackModel:
              state.context.chat.orchestrationFallbackModel,
          });

          const explicitEngagement = shouldEngageAgents(
            classification.shouldEngageAgents,
            state.input.messages,
            state.context.agents,
            state.input.mentions,
          );
          return complete({
            ...state,
            classification: explicitEngagement
              ? {
                  ...classification,
                  shouldEngageAgents: true,
                  reasoning: classification.shouldEngageAgents
                    ? classification.reasoning
                    : `${classification.reasoning} Explicit user directive requires agent participation.`,
                }
              : classification,
          });
        } catch (error) {
          return complete({
            ...state,
            classification: createDirectClassification(
              state.input,
              state.context.agents,
            ),
            failureReason: undefined,
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

        const effectiveClassification = {
          ...state.classification,
          shouldEngageAgents: shouldEngageAgents(
            state.classification.shouldEngageAgents,
            state.input.messages,
            state.context.agents,
            state.input.mentions,
          ),
        };

        if (
          !state.context.chat.orchestrationEnabled ||
          state.context.agents.length === 0 ||
          !effectiveClassification.shouldEngageAgents ||
          shouldUseControllerDirectly({
            messages: state.input.messages,
            mentions: state.input.mentions,
            orchestrationAgent: state.context.orchestrationAgent,
            agents: state.context.agents,
          })
        ) {
          return complete({
            ...state,
            plan: createDirectPlan(
              !effectiveClassification.shouldEngageAgents
                ? "No agent participation requested for this human conversation"
                : hasExplicitToolDirective(
                      state.input.messages,
                      state.input.mentions,
                    )
                  ? "The controller will use the explicitly mentioned tool directly"
                  : "The orchestration controller can handle this request directly",
            ),
          });
        }

        try {
          const plan = await planAgentExecutionStep({
            userId: state.input.actor.userId,
            classification: effectiveClassification,
            agents: state.context.agents,
            triggerMessages: state.input.messages,
            mentions: state.input.mentions,
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
          state.input.triggerType === "user_message" &&
          state.context.members.length > 1 &&
          !state.classification.shouldEngageAgents &&
          !hasExplicitAgentDirective(
            state.input.messages,
            state.context.agents,
            state.input.mentions,
          ) &&
          !hasExplicitToolDirective(state.input.messages, state.input.mentions)
        ) {
          return complete({
            ...state,
            agentResults: [],
            silent: true,
            workflowRunId: workflowContext.workflow.id,
          });
        }

        if (
          !state.context.chat.orchestrationEnabled ||
          state.context.agents.length === 0 ||
          state.plan.selectedAgents.length === 0
        ) {
          const directPlan = createDirectCheckpointPlan(state);
          const directTaskDescriptors = toTaskDescriptors([directPlan], 1);
          let directTaskLedger = markAgentTasksRunning(
            addAgentTasks([], directTaskDescriptors),
            directTaskDescriptors,
          );
          await persistDurableAgentLoopSnapshot(workflowContext.workflow.id, {
            iteration: 1,
            phase: "executing",
            resultCount: 0,
            ledger: directTaskLedger,
          });
          const durableAgentResults = await loadDurableAgentResults(
            workflowContext.workflow.id,
          );
          const directKey = getAgentExecutionKey(directPlan);
          let directResult = durableAgentResults.get(directKey);
          if (!directResult) {
            directResult = await executeDirectResponseStep({
              actor: state.input.actor,
              context: state.context,
              inputMessages: state.input.messages,
              workflowId: workflowContext.workflow.id,
            });
            await flushDurableUIChunks(workflowContext.workflow.id);
            await persistDurableAgentResult(
              workflowContext.workflow.id,
              directKey,
              directResult,
            );
          }
          directTaskLedger = recordAgentTaskResults(directTaskLedger, [
            directResult,
          ]);
          await persistDurableAgentLoopSnapshot(workflowContext.workflow.id, {
            iteration: 1,
            phase: "completed",
            resultCount: 1,
            status: directResult.success ? "completed" : "blocked",
            reason: directResult.error,
            ledger: directTaskLedger,
          });
          await flushDurableUIChunks(workflowContext.workflow.id);
          return complete({
            ...state,
            agentResults: [directResult],
            workflowRunId: workflowContext.workflow.id,
            agentLoopIteration: 1,
            agentLoopStatus: "completed",
            agentTaskLedger: directTaskLedger,
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
        const loopResult = await executeAgenticLoop({
          actor: state.input.actor,
          plan: state.plan,
          context: state.context,
          webhookPayload: state.input.webhookPayload,
          workflowId: workflowContext.workflow.id,
          durableAgentResults,
          triggerMessages: state.input.messages,
          classification: state.classification,
          orchestrationAgent: state.context.orchestrationAgent,
          orchestrationModel: state.context.chat.orchestrationModel,
          orchestrationFallbackModel:
            state.context.chat.orchestrationFallbackModel,
        });
        await flushDurableUIChunks(workflowContext.workflow.id);

        let finalAgentResults = loopResult.results;
        let finalTaskLedger = loopResult.taskLedger;
        if (
          state.plan.fallbackAgentId &&
          finalAgentResults.length > 0 &&
          finalAgentResults.every((result) => !result.success) &&
          !finalAgentResults.some(
            (result) => result.agentId === state.plan?.fallbackAgentId,
          )
        ) {
          const fallbackAgent = state.context.agents.find(
            (agent) => agent.agentId === state.plan?.fallbackAgentId,
          );

          if (fallbackAgent) {
            const fallbackPlan: ExecutionPlan["selectedAgents"][number] = {
              agentId: fallbackAgent.agentId,
              order: finalAgentResults.length,
              parallelGroup: null,
              dependsOn: null,
              reason: "Reserve agent invoked after primary execution failed.",
              task: `Retry the original request using the reserve agent.\n\n${getTextFromMessages(state.input.messages)}`,
              estimatedDuration: null,
              priority: "high",
            };
            const fallbackResult = await executeCheckpointedAgent({
              actor: state.input.actor,
              agentPlan: fallbackPlan,
              context: state.context,
              previousResults: finalAgentResults,
              webhookPayload: state.input.webhookPayload,
              workflowId: workflowContext.workflow.id,
              durableAgentResults,
              plan: state.plan,
            });
            finalAgentResults = [...finalAgentResults, fallbackResult];
            const fallbackDescriptors = toTaskDescriptors(
              [fallbackPlan],
              loopResult.iterations + 1,
            );
            finalTaskLedger = recordAgentTaskResults(
              markAgentTasksRunning(
                addAgentTasks(finalTaskLedger, fallbackDescriptors),
                fallbackDescriptors,
              ),
              [fallbackResult],
            );
            await persistDurableAgentLoopSnapshot(workflowContext.workflow.id, {
              iteration: loopResult.iterations + 1,
              phase: "completed",
              resultCount: finalAgentResults.length,
              status: fallbackResult.success ? "completed" : "blocked",
              reason: fallbackResult.error,
              ledger: finalTaskLedger,
            });
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
          agentLoopIteration: loopResult.iterations,
          agentLoopStatus: loopResult.status,
          agentLoopDecision: loopResult.reason,
          agentLoopPlanSteps: loopResult.planSteps,
          agentTaskLedger: finalTaskLedger,
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
          where: eq(humanApproval.id, state.pendingApprovalId),
        });

        if (!pendingApproval) {
          // The approval was decided or expired between the agent step and
          // this durable checkpoint. Continue to aggregation, which reads the
          // final decision from the database.
          return complete({ ...state, pendingApprovalId: undefined });
        }

        if (pendingApproval.status === "pending") {
          return waitForAndRetry(5_000, state);
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

        // An approved non-MCP request is already complete. MCP requests were
        // executed above; all other terminal decisions should be projected to
        // aggregation instead of polling forever.
        return complete({ ...state, pendingApprovalId: undefined });
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

        if (state.silent) {
          return complete({
            ...state,
            finalResult: createSilentResult(),
          });
        }

        const context = state.context;
        if (!context) return complete(state);
        const finalResult = await aggregateResultsStep({
          userId: state.input.actor.userId,
          providerId: context.orchestrationAgent?.providerId,
          modelId:
            context.orchestrationAgent?.model ??
            context.chat.orchestrationModel,
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
  agents: Parameters<typeof hasExplicitAgentDirective>[1] = [],
): RequestClassification {
  return {
    intent: "question",
    complexity: "simple",
    domains: [],
    requiresMultipleAgents: false,
    shouldEngageAgents:
      input.triggerType === "webhook_event" ||
      hasExplicitAgentDirective(input.messages, agents, input.mentions) ||
      hasExplicitToolDirective(input.messages, input.mentions),
    estimatedSteps: 1,
    urgency: "medium",
    notifyMembers: false,
    keyEntities: [],
    reasoning:
      "Direct assistant response mode; agent participation requires an explicit directive or webhook trigger when classification is unavailable.",
  };
}

function createDirectPlan(reason: string): ExecutionPlan {
  return {
    strategy: "single",
    reasoning: reason,
    stopOnError: true,
    selectedAgents: [],
    fallbackAgentId: null,
    timeoutMinutes: 10,
  };
}

function createDirectCheckpointPlan(
  state: OrchestrationWorkflowState,
): ExecutionPlan["selectedAgents"][number] {
  return {
    agentId: `controller:${state.context?.orchestrationAgent?.id ?? "default"}`,
    order: 0,
    parallelGroup: null,
    dependsOn: null,
    reason: "Direct controller response checkpoint",
    task: getTextFromMessages(state.input.messages),
    estimatedDuration: null,
    priority: "high",
  };
}

function createSilentResult() {
  return {
    summary: "No agent response was requested.",
    detailedResponse: "",
    actionItems: [],
    successfulAgents: [],
    failedAgents: [],
    overallSuccess: true,
    recommendations: [],
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

const MAX_AGENTIC_ITERATIONS = 4;
const MAX_AGENTIC_AGENT_STEPS = 12;
const MAX_AGENTIC_RUNTIME_MS = 25 * 60 * 1000;

type AgenticLoopResult = {
  results: AgentExecutionResult[];
  planSteps: WorkflowPlanStepTrace[];
  taskLedger: AgentTaskLedgerEntry[];
  iterations: number;
  status: "completed" | "blocked";
  reason: string;
};

async function executeAgenticLoop(params: {
  actor: OrchestrationInput["actor"];
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
  durableAgentResults: Map<string, AgentExecutionResult>;
  triggerMessages: OrchestrationInput["messages"];
  mentions?: OrchestrationInput["mentions"];
  classification: RequestClassification;
  orchestrationAgent?: OrchestrationAgentProfile | null;
  orchestrationModel?: string | null;
  orchestrationFallbackModel?: string | null;
}): Promise<AgenticLoopResult> {
  const dataStream = toUIMessageStreamWriter(params.workflowId);
  type WorkflowStreamChunk = Parameters<
    ReturnType<typeof toUIMessageStreamWriter>["write"]
  >[0];
  const writeLoopEvent = (chunk: WorkflowStreamChunk) =>
    dataStream.write(chunk);
  const loopDeadline =
    Date.now() +
    Math.min(
      MAX_AGENTIC_RUNTIME_MS,
      Math.max(60_000, params.plan.timeoutMinutes * 60_000),
    );

  writeLoopEvent({
    type: "data-workflowLoopStarted",
    data: {
      workflowId: params.workflowId,
      maxIterations: MAX_AGENTIC_ITERATIONS,
      initialStepCount: params.plan.selectedAgents.length,
    },
  });

  const initialTaskDescriptors = toTaskDescriptors(
    params.plan.selectedAgents,
    1,
  );
  const durableSnapshots = await loadDurableAgentLoopSnapshots(
    params.workflowId,
  );
  const latestDurableSnapshot = [...durableSnapshots]
    .sort(
      (a, b) =>
        a.iteration - b.iteration ||
        agentLoopPhaseRank(a.phase) - agentLoopPhaseRank(b.phase),
    )
    .at(-1);
  let taskLedger = addAgentTasks(
    latestDurableSnapshot?.ledger ?? [],
    initialTaskDescriptors,
  );
  taskLedger = markAgentTasksRunning(taskLedger, initialTaskDescriptors);
  await persistDurableAgentLoopSnapshot(params.workflowId, {
    iteration: 1,
    phase: "executing",
    resultCount: 0,
    ledger: taskLedger,
  });
  let results = await executeAgentsAccordingToStrategy({
    ...params,
    previousResults: [],
  });
  taskLedger = recordAgentTaskResults(taskLedger, results);
  await persistDurableAgentLoopSnapshot(params.workflowId, {
    iteration: 1,
    phase: "observing",
    resultCount: results.length,
    ledger: taskLedger,
  });
  let iterations = 1;
  const durableDecisions = await loadDurableAgentProgressDecisions(
    params.workflowId,
  );
  const executedPlans: ExecutionPlan[] = [params.plan];
  let status: AgenticLoopResult["status"] = "completed";
  let reason = "The initial execution plan completed.";

  while (iterations < MAX_AGENTIC_ITERATIONS && Date.now() < loopDeadline) {
    writeLoopEvent({
      type: "data-workflowLoopIteration",
      data: {
        workflowId: params.workflowId,
        iteration: iterations,
        status: "evaluating",
        completedStepCount: results.length,
      },
    });
    await persistDurableAgentLoopSnapshot(params.workflowId, {
      iteration: iterations,
      phase: "evaluating",
      resultCount: results.length,
      ledger: taskLedger,
    });

    let decision = durableDecisions.get(iterations);
    if (!decision) {
      try {
        decision = await evaluateAgentProgressStep({
          userId: params.actor.userId,
          workflowId: params.workflowId,
          classification: params.classification,
          plan: params.plan,
          agents: params.context.agents,
          triggerMessages: params.triggerMessages,
          mentions: params.mentions,
          previousResults: results,
          orchestrationAgent: params.orchestrationAgent,
          orchestrationModel: params.orchestrationModel,
          orchestrationFallbackModel: params.orchestrationFallbackModel,
        });
      } catch (error) {
        status = "blocked";
        reason = `Progress evaluation unavailable: ${toErrorMessage(error)}`;
        decision = {
          decision: "blocked",
          reasoning: reason,
          nextSteps: [],
        };
      }
      decision = await persistDurableAgentProgressDecision(
        params.workflowId,
        iterations,
        decision,
      );
      durableDecisions.set(iterations, decision);
    }

    await persistDurableAgentLoopSnapshot(params.workflowId, {
      iteration: iterations,
      phase: "decided",
      resultCount: results.length,
      decision: decision.decision,
      ledger: taskLedger,
    });

    reason = decision.reasoning;
    writeLoopEvent({
      type: "data-workflowLoopDecision",
      data: {
        workflowId: params.workflowId,
        iteration: iterations,
        decision: decision.decision,
        reasoning: decision.reasoning,
        nextStepCount: decision.nextSteps.length,
      },
    });

    if (decision.decision !== "continue") {
      status = decision.decision === "blocked" ? "blocked" : "completed";
      break;
    }

    const remainingCapacity = MAX_AGENTIC_AGENT_STEPS - results.length;
    const nextSteps = decision.nextSteps.slice(0, remainingCapacity);
    if (nextSteps.length === 0) {
      status = "blocked";
      reason = "The agentic step budget has been exhausted.";
      break;
    }

    const nextPlan: ExecutionPlan = {
      ...params.plan,
      strategy: "sequential",
      selectedAgents: nextSteps.map((step, index) => ({
        agentId: step.agentId,
        order: results.length + index,
        parallelGroup: null,
        dependsOn: null,
        reason: step.reason,
        task: step.task,
        estimatedDuration: null,
        priority: step.priority,
      })),
    };
    const nextTaskDescriptors = toTaskDescriptors(
      nextPlan.selectedAgents,
      iterations + 1,
    );
    taskLedger = addAgentTasks(taskLedger, nextTaskDescriptors);
    taskLedger = markAgentTasksRunning(taskLedger, nextTaskDescriptors);
    await persistDurableAgentLoopSnapshot(params.workflowId, {
      iteration: iterations + 1,
      phase: "executing",
      resultCount: results.length,
      ledger: taskLedger,
    });
    executedPlans.push(nextPlan);
    writeLoopEvent({
      type: "data-workflowLoopIteration",
      data: {
        workflowId: params.workflowId,
        iteration: iterations + 1,
        status: "executing",
        stepCount: nextPlan.selectedAgents.length,
      },
    });

    const nextResults = await executeAgentsAccordingToStrategy({
      ...params,
      plan: nextPlan,
      previousResults: results,
    });
    results = [...results, ...nextResults];
    taskLedger = recordAgentTaskResults(taskLedger, nextResults);
    await persistDurableAgentLoopSnapshot(params.workflowId, {
      iteration: iterations + 1,
      phase: "observing",
      resultCount: results.length,
      ledger: taskLedger,
    });
    iterations += 1;
  }

  if (iterations >= MAX_AGENTIC_ITERATIONS && status === "completed") {
    reason = "The maximum agentic iteration budget was reached.";
  }
  if (Date.now() >= loopDeadline && iterations < MAX_AGENTIC_ITERATIONS) {
    status = "blocked";
    reason = "The agentic execution time budget was reached.";
  }
  if (status === "blocked") {
    taskLedger = markUnfinishedAgentTasksBlocked(taskLedger, reason);
  }
  writeLoopEvent({
    type: "data-workflowLoopCompleted",
    data: {
      workflowId: params.workflowId,
      iterations,
      status,
      reason,
    },
  });
  await persistDurableAgentLoopSnapshot(params.workflowId, {
    iteration: iterations,
    phase: "completed",
    resultCount: results.length,
    status,
    reason,
    ledger: taskLedger,
  });
  return {
    results,
    planSteps: buildAgenticPlanSteps(params.workflowId, executedPlans, results),
    taskLedger,
    iterations,
    status,
    reason,
  };
}

function toTaskDescriptors(
  agents: ExecutionPlan["selectedAgents"],
  iteration: number,
): AgentTaskDescriptor[] {
  return agents.map((agent) => ({
    agentId: agent.agentId,
    task: agent.task,
    order: agent.order,
    iteration,
    priority: agent.priority,
    dependsOn: agent.dependsOn ?? [],
  }));
}

function agentLoopPhaseRank(
  phase:
    | "planned"
    | "executing"
    | "observing"
    | "evaluating"
    | "decided"
    | "completed",
): number {
  return {
    planned: 0,
    executing: 1,
    observing: 2,
    evaluating: 3,
    decided: 4,
    completed: 5,
  }[phase];
}

function buildAgenticPlanSteps(
  workflowId: string,
  plans: ExecutionPlan[],
  results: AgentExecutionResult[],
): WorkflowPlanStepTrace[] {
  const plannedSteps = plans.flatMap((plan) =>
    plan.selectedAgents.map((agentPlan) => ({ plan, agentPlan })),
  );
  return plannedSteps.map(({ plan, agentPlan }, stepIndex) => {
    const result = results.find(
      (candidate) =>
        candidate.agentId === agentPlan.agentId &&
        candidate.task === agentPlan.task,
    );
    const status: WorkflowPlanStepTrace["status"] = !result
      ? "skipped"
      : result.success
        ? "completed"
        : result.error?.startsWith("Skipped") ||
            result.error === "Dependencies not met"
          ? "skipped"
          : "failed";
    return {
      workflowId,
      stepId: `plan:${agentPlan.agentId}:${agentPlan.order}`,
      agentId: agentPlan.agentId,
      agentName: result?.agentName ?? "Unknown Agent",
      task: agentPlan.task,
      strategy: plan.strategy,
      stepIndex,
      totalSteps: plannedSteps.length,
      status,
      ...(result?.startTime
        ? { startedAt: result.startTime.toISOString() }
        : {}),
      ...(result?.endTime ? { completedAt: result.endTime.toISOString() } : {}),
      ...(result?.durationMs !== undefined
        ? { durationMs: result.durationMs }
        : {}),
      ...(result?.error ? { error: result.error } : {}),
    };
  });
}

async function executeAgentsAccordingToStrategy(params: {
  actor: OrchestrationInput["actor"];
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  workflowId: string;
  durableAgentResults: Map<string, AgentExecutionResult>;
  previousResults?: AgentExecutionResult[];
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
        previousResults: params.previousResults,
      });
    case "parallel":
      return executeParallel(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
        params.previousResults,
      );
    case "conditional":
      return executeConditional(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
        params.previousResults,
      );
    case "single":
      return executeSingle(
        actor,
        plan,
        context,
        webhookPayload,
        workflowId,
        durableAgentResults,
        params.previousResults,
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
  previousResults?: AgentExecutionResult[];
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
  const previousResults = params.previousResults ?? [];
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
      previousResults: [...previousResults, ...results],
      webhookPayload,
      workflowId,
      durableAgentResults,
      plan,
    });
    results.push(result);

    if (!result.success && plan.stopOnError) {
      for (const skippedAgent of sortedAgents.slice(index + 1)) {
        const skipped = createSkippedResult(
          skippedAgent,
          context,
          "Skipped due to previous agent failure",
        );
        publishPlanStepEvent(
          workflowId,
          plan,
          skippedAgent,
          "skipped",
          context,
          skipped,
        );
        results.push(skipped);
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
  previousResults: AgentExecutionResult[] = [],
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
          previousResults: [...previousResults, ...results],
          webhookPayload,
          workflowId,
          durableAgentResults,
          plan,
        }),
      ),
    );
    results.push(...groupResults);
    if (plan.stopOnError && groupResults.some((result) => !result.success)) {
      for (const skippedAgent of plan.selectedAgents.filter(
        (candidate) =>
          !results.some(
            (result) =>
              result.agentId === candidate.agentId &&
              result.task === candidate.task,
          ),
      )) {
        const skipped = createSkippedResult(
          skippedAgent,
          context,
          "Skipped due to previous agent failure",
        );
        publishPlanStepEvent(
          workflowId,
          plan,
          skippedAgent,
          "skipped",
          context,
          skipped,
        );
        results.push(skipped);
      }
      break;
    }
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
  previousResults: AgentExecutionResult[] = [],
): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];
  const executed = new Set<string>();
  const resultMap = new Map<string, AgentExecutionResult>();
  for (const agentPlan of plan.selectedAgents) {
    const previousResult = previousResults.find(
      (result) =>
        result.agentId === agentPlan.agentId && result.task === agentPlan.task,
    );
    if (!previousResult) continue;
    const taskKey = getPlanTaskKey(agentPlan);
    executed.add(taskKey);
    resultMap.set(taskKey, previousResult);
  }

  while (executed.size < plan.selectedAgents.length) {
    const ready = plan.selectedAgents.filter((agent) => {
      if (executed.has(getPlanTaskKey(agent))) return false;
      return (agent.dependsOn ?? []).every((dependencyId) =>
        plan.selectedAgents.some(
          (dependency) =>
            dependency.agentId === dependencyId &&
            executed.has(getPlanTaskKey(dependency)) &&
            resultMap.get(getPlanTaskKey(dependency))?.success,
        ),
      );
    });

    if (ready.length === 0) {
      for (const agent of plan.selectedAgents.filter(
        (candidate) => !executed.has(getPlanTaskKey(candidate)),
      )) {
        const failed = createSkippedResult(
          agent,
          context,
          "Dependencies not met",
        );
        publishPlanStepEvent(
          workflowId,
          plan,
          agent,
          "skipped",
          context,
          failed,
        );
        results.push(failed);
        const taskKey = getPlanTaskKey(agent);
        resultMap.set(taskKey, failed);
        executed.add(taskKey);
      }
      break;
    }

    const batchResults = await Promise.all(
      ready.map((agentPlan) =>
        executeCheckpointedAgent({
          actor,
          agentPlan,
          context,
          previousResults: [...previousResults, ...results],
          webhookPayload,
          workflowId,
          durableAgentResults,
          plan,
        }),
      ),
    );

    for (const result of batchResults) {
      results.push(result);
      const agentPlan = ready.find(
        (candidate) =>
          candidate.agentId === result.agentId &&
          candidate.task === result.task,
      );
      if (agentPlan) {
        const taskKey = getPlanTaskKey(agentPlan);
        resultMap.set(taskKey, result);
        executed.add(taskKey);
      }
    }

    if (plan.stopOnError && batchResults.some((result) => !result.success)) {
      for (const agent of plan.selectedAgents.filter(
        (candidate) => !executed.has(getPlanTaskKey(candidate)),
      )) {
        const skipped = createSkippedResult(
          agent,
          context,
          "Stopped due to previous failure",
        );
        publishPlanStepEvent(
          workflowId,
          plan,
          agent,
          "skipped",
          context,
          skipped,
        );
        results.push(skipped);
        const taskKey = getPlanTaskKey(agent);
        resultMap.set(taskKey, skipped);
        executed.add(taskKey);
      }
      break;
    }
  }

  return results;
}

function getPlanTaskKey(
  agentPlan: ExecutionPlan["selectedAgents"][number],
): string {
  return `${agentPlan.agentId}\u001f${agentPlan.order}\u001f${agentPlan.task}`;
}

async function executeSingle(
  actor: OrchestrationInput["actor"],
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload: OrchestrationInput["webhookPayload"],
  workflowId: string,
  durableAgentResults: Map<string, AgentExecutionResult>,
  previousResults: AgentExecutionResult[] = [],
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];
  if (!agentPlan) return [];
  return [
    await executeCheckpointedAgent({
      actor,
      agentPlan,
      context,
      previousResults,
      webhookPayload,
      workflowId,
      durableAgentResults,
      plan,
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
  plan: ExecutionPlan;
}): Promise<AgentExecutionResult> {
  const key = getAgentExecutionKey(params.agentPlan);
  const existing = params.durableAgentResults.get(key);
  if (existing) {
    publishPlanStepEvent(
      params.workflowId,
      params.plan,
      params.agentPlan,
      existing.success ? "completed" : "failed",
      params.context,
      existing,
    );
    return existing;
  }

  publishPlanStepEvent(
    params.workflowId,
    params.plan,
    params.agentPlan,
    "running",
    params.context,
  );
  try {
    const result = await executeAgentTaskStep(params);
    await flushDurableUIChunks(params.workflowId);
    await persistDurableAgentResult(params.workflowId, key, result);
    params.durableAgentResults.set(key, result);
    publishPlanStepEvent(
      params.workflowId,
      params.plan,
      params.agentPlan,
      result.success ? "completed" : "failed",
      params.context,
      result,
    );
    return result;
  } catch (error) {
    publishPlanStepEvent(
      params.workflowId,
      params.plan,
      params.agentPlan,
      "failed",
      params.context,
      undefined,
      toErrorMessage(error),
    );
    throw error;
  }
}

function publishPlanStepEvent(
  workflowId: string,
  plan: ExecutionPlan,
  agentPlan: ExecutionPlan["selectedAgents"][number],
  status: WorkflowPlanStepTrace["status"],
  context: ChatContext,
  result?: AgentExecutionResult,
  error?: string,
): void {
  const chatAgent = context.agents.find(
    (candidate) => candidate.agentId === agentPlan.agentId,
  );
  const stepIndex = Math.max(
    0,
    plan.selectedAgents.findIndex(
      (candidate) =>
        candidate.agentId === agentPlan.agentId &&
        candidate.order === agentPlan.order &&
        candidate.task === agentPlan.task,
    ),
  );
  const data: WorkflowPlanStepTrace = {
    workflowId,
    stepId: `plan:${agentPlan.agentId}:${agentPlan.order}`,
    agentId: agentPlan.agentId,
    agentName: result?.agentName ?? chatAgent?.agent.name ?? "Unknown Agent",
    task: agentPlan.task,
    strategy: plan.strategy,
    stepIndex,
    totalSteps: plan.selectedAgents.length,
    status,
    ...(result?.startTime ? { startedAt: result.startTime.toISOString() } : {}),
    ...(result?.endTime ? { completedAt: result.endTime.toISOString() } : {}),
    ...(result?.durationMs !== undefined
      ? { durationMs: result.durationMs }
      : {}),
    ...(error || result?.error ? { error: error ?? result?.error } : {}),
  };
  toUIMessageStreamWriter(workflowId).write({
    type: "data-workflowPlanStep",
    data,
  });
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
