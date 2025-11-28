import { Message } from "@/db";
import { CustomUIMessageChunk } from "@/lib/types";
import { aggregateResultsStep } from "@/workflows/orchestrate/steps/aggregate-results-step";
import { createOrchestrationLogStep } from "@/workflows/orchestrate/steps/create-orchestration-log-step";
import {
  AgentExecutionResult,
  executeAgentTaskStep,
} from "@/workflows/orchestrate/steps/execute-agent-task-step";
import {
  ChatContext,
  loadChatContextStep,
} from "@/workflows/orchestrate/steps/load-chat-step";
import { notifyChatMembersStep } from "@/workflows/orchestrate/steps/notify-chat-members-step";
import {
  ExecutionPlan,
  planAgentExecutionStep,
} from "@/workflows/orchestrate/steps/plan-agent-execution-step";
import { saveWorkflowProgressStep } from "@/workflows/orchestrate/steps/save-progress-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import {
  FatalError,
  fetch,
  getWorkflowMetadata,
  getWritable,
  sleep,
} from "workflow";
import { classifyRequestStep } from "./steps/classify-request-step";

const logger = console;

async function sendEvent(event: CustomUIMessageChunk) {
  "use step";

  const writable = getWritable<CustomUIMessageChunk>();
  const writer = writable.getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
  writer.releaseLock();
}

function detectCircularDependencies(
  agents: ExecutionPlan["selectedAgents"],
): string | null {
  const agentMap = new Map(agents.map((a) => [a.agentId, a]));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(agentId: string, path: string[] = []): string | null {
    if (recursionStack.has(agentId)) {
      return `Circular dependency detected: ${[...path, agentId].join(" -> ")}`;
    }
    if (visited.has(agentId)) {
      return null;
    }

    visited.add(agentId);
    recursionStack.add(agentId);

    const agent = agentMap.get(agentId);
    for (const depId of agent?.dependsOn || []) {
      if (!agentMap.has(depId)) {
        return `Agent ${agentId} depends on non-existent agent ${depId}`;
      }
      const cycle = hasCycle(depId, [...path, agentId]);
      if (cycle) return cycle;
    }

    recursionStack.delete(agentId);
    return null;
  }

  for (const agent of agents) {
    const cycle = hasCycle(agent.agentId);
    if (cycle) return cycle;
  }

  return null;
}

export async function orchestrateWorkflow(input: OrchestrationInput) {
  "use workflow";

  // Enable AI SDK calls as workflow steps
  globalThis.fetch = fetch;

  const startTime = Date.now();
  let errorStack: string | undefined;
  try {
    logger.info("Workflow Started");

    const ctx = getWorkflowMetadata();

    await sendEvent({
      type: "data-workflowStarted",
      data: {
        workflowId: ctx.workflowRunId,
        chatId: input.chatId,
        messageId: input.messageId,
      },
    });

    // Track workflow started
    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "started",
      completedAgents: [],
      totalAgents: 0,
      progress: 0,
      lastUpdate: new Date(),
    });

    // Step 1: Load chat context (messages, agents, members)
    const context = await loadChatContextStep(input.chatId);
    logger.info("Context Loaded", context);

    // Step 2: Verify orchestration is enabled
    if (!context.chat.orchestrationEnabled) {
      return {
        success: false,
        reason: "Orchestration is disabled for this chat",
      };
    }

    // Step 3: Get the trigger message
    const triggerMessage = context.messages.find(
      (m) => m.id === input.messageId,
    );
    if (!triggerMessage) {
      throw new FatalError("Could not find trigger message!");
    }

    logger.info(
      "Trigger Message Retrieved",
      triggerMessage.content,
      triggerMessage.id,
    );

    // Step 4: Check if we have suitable agents
    if (context.agents.length === 0) {
      return {
        success: false,
        reason: "No agents available in this chat",
      };
    }

    // Step 5: Classify the request
    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "classifying",
      completedAgents: [],
      totalAgents: 0,
      progress: 10,
      lastUpdate: new Date(),
    });

    const classification = await classifyRequestStep({
      message: triggerMessage,
      messages: context.messages,
      triggerType: input.triggerType,
      webhookPayload: input.webhookPayload,
    });

    logger.info("Classified", classification);
    await sendEvent({
      type: "data-workflowClassification",
      data: classification,
    });

    // Step 6: Plan agent execution
    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "planning",
      completedAgents: [],
      totalAgents: 0,
      progress: 20,
      lastUpdate: new Date(),
    });

    const executionPlan = await planAgentExecutionStep({
      classification,
      agents: context.agents,
      triggerMessage,
      webhookPayload: input.webhookPayload,
    });

    await sendEvent({
      type: "data-workflowPlan",
      data: executionPlan,
    });

    logger.info("Execution Planned", executionPlan);

    // Step 7: Validate execution plan
    if (executionPlan.selectedAgents.length === 0) {
      await createOrchestrationLogStep({
        chatId: input.chatId,
        messageId: input.messageId,
        triggerType: input.triggerType,
        webhookPayload: input.webhookPayload,
        classification,
        executionPlan,
        agentResults: [],
        finalResult: null,
        executionTimeMs: Date.now() - startTime,
        success: false,
        error: "No suitable agents found for this request",
      });

      return {
        success: false,
        reason: "No suitable agents found for this request",
        classification,
        reasoning: executionPlan.reasoning,
      };
    }

    // Step 7b: Check for circular dependencies
    if (executionPlan.strategy === "conditional") {
      const circularDep = detectCircularDependencies(
        executionPlan.selectedAgents,
      );
      if (circularDep) {
        throw new FatalError(`Execution plan invalid: ${circularDep}`);
      }
    }

    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "executing",
      completedAgents: [],
      totalAgents: executionPlan.selectedAgents.length,
      progress: 30,
      lastUpdate: new Date(),
    });

    // Step 8: Execute agents with timeout
    const timeoutPromise = (async () => {
      await sleep(`${executionPlan.timeoutMinutes}m`);
      throw new Error("Workflow execution timeout");
    })();

    const executionPromise = executeAgentsAccordingToStrategy({
      plan: executionPlan,
      context,
      triggerMessage,
      webhookPayload: input.webhookPayload,
      chatId: input.chatId,
      messageId: input.messageId,
    });

    const agentResults = await Promise.race([executionPromise, timeoutPromise]);

    logger.info("Agent Results", agentResults);

    // Step 9: Check fallback agent
    let finalAgentResults = agentResults;
    if (
      executionPlan.fallbackAgentId &&
      agentResults.every((r) => !r.success)
    ) {
      logger.info("All agents failed, trying fallback agent");

      const fallbackAgent = executionPlan.selectedAgents.find(
        (a) => a.agentId === executionPlan.fallbackAgentId,
      );

      if (fallbackAgent) {
        const fallbackResult = await executeAgentTaskStep({
          agentPlan: fallbackAgent,
          context,
          triggerMessage,
          previousResults: agentResults,
          webhookPayload: input.webhookPayload,
        });

        finalAgentResults = [...agentResults, fallbackResult];
      }
    }

    // Step 10: Aggregate results
    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "aggregating",
      completedAgents: finalAgentResults
        .filter((r) => r.success)
        .map((r) => r.agentId),
      totalAgents: executionPlan.selectedAgents.length,
      progress: 90,
      lastUpdate: new Date(),
    });

    const finalResult = await aggregateResultsStep({
      agentResults: finalAgentResults,
      plan: executionPlan,
      classification,
      triggerMessage,
    });

    await sendEvent({
      type: "data-workflowAggregated",
      data: finalResult,
    });

    // Step 11: Log orchestration
    await createOrchestrationLogStep({
      chatId: input.chatId,
      messageId: input.messageId,
      triggerType: input.triggerType,
      webhookPayload: input.webhookPayload,
      classification,
      executionPlan,
      agentResults: finalAgentResults,
      finalResult,
      executionTimeMs: Date.now() - startTime,
      success: true,
    });

    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "completed",
      completedAgents: finalAgentResults
        .filter((r) => r.success)
        .map((r) => r.agentId),
      totalAgents: executionPlan.selectedAgents.length,
      progress: 100,
      lastUpdate: new Date(),
    });

    // Step 12: Notify members
    if (classification.notifyMembers) {
      await notifyChatMembersStep({
        chatId: input.chatId,
        excludeUserId: triggerMessage.authorId,
        notification: {
          type: "orchestration_complete",
          agentCount: finalAgentResults.length,
          summary: finalResult.summary,
        },
      });
    }

    return {
      success: true,
      classification,
      executionPlan,
      agentResults: finalAgentResults,
      finalResult,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof Error) {
      errorStack = error.stack;
    }

    await saveWorkflowProgressStep({
      chatId: input.chatId,
      messageId: input.messageId,
      status: "failed",
      completedAgents: [],
      totalAgents: 0,
      progress: 0,
      lastUpdate: new Date(),
    });

    await createOrchestrationLogStep({
      chatId: input.chatId,
      messageId: input.messageId,
      triggerType: input.triggerType,
      webhookPayload: input.webhookPayload,
      classification: null,
      executionPlan: null,
      agentResults: [],
      finalResult: null,
      executionTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorStack,
    });

    throw error;
  }
}

// NOT a step - orchestration logic
async function executeAgentsAccordingToStrategy(params: {
  plan: ExecutionPlan;
  context: ChatContext;
  triggerMessage: Message;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  chatId: string;
  messageId: string;
}) {
  const { plan, context, triggerMessage, webhookPayload, chatId, messageId } =
    params;

  switch (plan.strategy) {
    case "sequential":
      return await executeSequential({
        plan,
        context,
        triggerMessage,
        webhookPayload,
        chatId,
        messageId,
      });

    case "parallel":
      return await executeParallel(
        plan,
        context,
        triggerMessage,
        webhookPayload,
        chatId,
        messageId,
      );

    case "conditional":
      return await executeConditional(
        plan,
        context,
        triggerMessage,
        webhookPayload,
        chatId,
        messageId,
      );

    case "single":
      return await executeSingle(
        plan,
        context,
        triggerMessage,
        webhookPayload,
        chatId,
        messageId,
      );

    default:
      throw new Error(`Unknown execution strategy: ${plan.strategy}`);
  }
}

// NOT a step - orchestration logic
async function executeSequential(params: {
  plan: ExecutionPlan;
  context: ChatContext;
  triggerMessage: Message;
  webhookPayload?: OrchestrationInput["webhookPayload"];
  chatId: string;
  messageId: string;
}): Promise<AgentExecutionResult[]> {
  const { plan, context, triggerMessage, webhookPayload, chatId, messageId } =
    params;
  const results: AgentExecutionResult[] = [];

  const sortedAgents = [...plan.selectedAgents].sort(
    (a, b) => a.order - b.order,
  );

  for (let i = 0; i < sortedAgents.length; i++) {
    const agentPlan = sortedAgents[i];

    const result = await executeAgentTaskStep({
      agentPlan,
      context,
      triggerMessage,
      previousResults: results,
      webhookPayload,
    });

    results.push(result);

    const progressPercent =
      30 + Math.floor((60 / sortedAgents.length) * (i + 1));
    await saveWorkflowProgressStep({
      chatId,
      messageId,
      status: "executing",
      currentAgent:
        result.success && i + 1 < sortedAgents.length
          ? sortedAgents[i + 1].agentId
          : undefined,
      completedAgents: results.filter((r) => r.success).map((r) => r.agentId),
      totalAgents: sortedAgents.length,
      progress: progressPercent,
      lastUpdate: new Date(),
    });

    if (!result.success && plan.stopOnError) {
      // Mark remaining as skipped
      for (let j = i + 1; j < sortedAgents.length; j++) {
        const skippedAgent = sortedAgents[j];
        const skippedChatAgent = context.agents.find(
          (a) => a.agentId === skippedAgent.agentId,
        );
        results.push({
          agentId: skippedAgent.agentId,
          agentName: skippedChatAgent?.agent.name || "Unknown Agent",
          task: skippedAgent.task,
          success: false,
          error: "Skipped due to previous agent failure",
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 0,
        });
      }
      break;
    }
  }

  return results;
}

// NOT a step - orchestration logic
async function executeParallel(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  webhookPayload?: OrchestrationInput["webhookPayload"],
  chatId?: string,
  messageId?: string,
): Promise<AgentExecutionResult[]> {
  const groups = new Map<number, typeof plan.selectedAgents>();

  for (const agent of plan.selectedAgents) {
    const groupId = agent.parallelGroup ?? 0;
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId)!.push(agent);
  }

  const results: AgentExecutionResult[] = [];
  const sortedGroupIds = Array.from(groups.keys()).sort((a, b) => a - b);

  for (let groupIdx = 0; groupIdx < sortedGroupIds.length; groupIdx++) {
    const groupId = sortedGroupIds[groupIdx];
    const groupAgents = groups.get(groupId)!;

    const groupResults = await Promise.all(
      groupAgents.map((agentPlan) =>
        executeAgentTaskStep({
          agentPlan,
          context,
          triggerMessage,
          previousResults: results,
          webhookPayload,
        }),
      ),
    );

    results.push(...groupResults);

    if (chatId && messageId) {
      const progressPercent =
        30 + Math.floor((60 / sortedGroupIds.length) * (groupIdx + 1));
      await saveWorkflowProgressStep({
        chatId,
        messageId,
        status: "executing",
        completedAgents: results.filter((r) => r.success).map((r) => r.agentId),
        totalAgents: plan.selectedAgents.length,
        progress: progressPercent,
        lastUpdate: new Date(),
      });
    }

    if (plan.stopOnError && groupResults.some((r) => !r.success)) {
      break;
    }
  }

  return results;
}

// NOT a step - orchestration logic
async function executeConditional(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  webhookPayload: OrchestrationInput["webhookPayload"] | undefined,
  chatId?: string,
  messageId?: string,
): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];
  const executed = new Set<string>();
  const resultMap = new Map<string, AgentExecutionResult>();

  const maxIterations = plan.selectedAgents.length * 2;
  let iterations = 0;

  while (
    executed.size < plan.selectedAgents.length &&
    iterations < maxIterations
  ) {
    iterations++;

    const ready = plan.selectedAgents.filter((agent) => {
      if (executed.has(agent.agentId)) return false;

      const dependencies = agent.dependsOn || [];
      const dependenciesMet = dependencies.every((depId) => {
        const isExecuted = executed.has(depId);
        const depResult = resultMap.get(depId);
        return isExecuted && depResult?.success;
      });

      return dependenciesMet;
    });

    if (ready.length === 0) {
      const unexecuted = plan.selectedAgents.filter(
        (a) => !executed.has(a.agentId),
      );

      if (unexecuted.length > 0) {
        console.warn(
          `Cannot execute remaining agents due to unmet dependencies`,
        );

        for (const agent of unexecuted) {
          const chatAgent = context.agents.find(
            (ca) => ca.agentId === agent.agentId,
          );
          const failedResult: AgentExecutionResult = {
            agentId: agent.agentId,
            agentName: chatAgent?.agent.name || "Unknown",
            task: agent.task,
            success: false,
            error: "Dependencies not met",
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0,
          };
          results.push(failedResult);
          resultMap.set(agent.agentId, failedResult);
        }
      }
      break;
    }

    const batchResults = await Promise.all(
      ready.map((agentPlan) =>
        executeAgentTaskStep({
          agentPlan,
          context,
          triggerMessage,
          previousResults: results,
          webhookPayload,
        }),
      ),
    );

    for (const result of batchResults) {
      results.push(result);
      resultMap.set(result.agentId, result);
      executed.add(result.agentId);
    }

    if (chatId && messageId) {
      const progressPercent =
        30 + Math.floor((60 / plan.selectedAgents.length) * executed.size);
      await saveWorkflowProgressStep({
        chatId,
        messageId,
        status: "executing",
        completedAgents: results.filter((r) => r.success).map((r) => r.agentId),
        totalAgents: plan.selectedAgents.length,
        progress: progressPercent,
        lastUpdate: new Date(),
      });
    }

    if (plan.stopOnError && batchResults.some((r) => !r.success)) {
      const remaining = plan.selectedAgents.filter(
        (a) => !executed.has(a.agentId),
      );
      for (const agent of remaining) {
        const chatAgent = context.agents.find(
          (ca) => ca.agentId === agent.agentId,
        );
        const skippedResult: AgentExecutionResult = {
          agentId: agent.agentId,
          agentName: chatAgent?.agent.name || "Unknown",
          task: agent.task,
          success: false,
          error: "Stopped due to previous failure",
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 0,
        };
        results.push(skippedResult);
        resultMap.set(agent.agentId, skippedResult);
      }
      break;
    }
  }

  return results;
}

// NOT a step - orchestration logic
async function executeSingle(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  webhookPayload?: OrchestrationInput["webhookPayload"],
  chatId?: string,
  messageId?: string,
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];

  const result = await executeAgentTaskStep({
    agentPlan,
    context,
    triggerMessage,
    previousResults: [],
    webhookPayload,
  });

  if (chatId && messageId) {
    await saveWorkflowProgressStep({
      chatId,
      messageId,
      status: "executing",
      completedAgents: result.success ? [result.agentId] : [],
      totalAgents: 1,
      progress: 90,
      lastUpdate: new Date(),
    });
  }

  return [result];
}
