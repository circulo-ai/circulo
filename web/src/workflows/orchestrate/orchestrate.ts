import { CustomUIMessageChunk } from "@/lib/types";
import { aggregateResultsStep } from "@/workflows/orchestrate/steps/aggregate-results-step";
import {
  AgentExecutionResult,
  executeAgentTaskStep,
} from "@/workflows/orchestrate/steps/execute-agent-task-step";
import {
  ChatContext,
  loadChatContextStep,
} from "@/workflows/orchestrate/steps/load-chat-step";
import {
  ExecutionPlan,
  planAgentExecutionStep,
} from "@/workflows/orchestrate/steps/plan-agent-execution-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { Session } from "better-auth";
import {
  FatalError,
  fetch,
  getWorkflowMetadata,
  getWritable,
  sleep,
} from "workflow";
import { classifyRequestStep } from "./steps/classify-request-step";

const logger = console;

export async function sendEvent(event: CustomUIMessageChunk) {
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

  const session = input.session;

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
        messages: input.messages,
      },
    });

    const context = await loadChatContextStep(input.chatId);
    logger.info("Context Loaded", context);

    if (!context.chat.orchestrationEnabled) {
      return {
        success: false,
        reason: "Orchestration is disabled for this chat",
      };
    }

    if (context.agents.length === 0) {
      return {
        success: false,
        reason: "No agents available in this chat",
      };
    }

    const classification = await classifyRequestStep({
      inputMessages: input.messages,
      messages: context.messages,
      triggerType: input.triggerType,
      webhookPayload: input.webhookPayload,
    });

    logger.info("Classified", classification);
    await sendEvent({
      type: "data-workflowClassification",
      data: classification,
    });

    const executionPlan = await planAgentExecutionStep({
      classification,
      agents: context.agents,
      triggerMessages: input.messages,
      webhookPayload: input.webhookPayload,
    });

    await sendEvent({
      type: "data-workflowPlan",
      data: executionPlan,
    });

    logger.info("Execution Planned", executionPlan);

    if (executionPlan.selectedAgents.length === 0) {
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

    const timeoutPromise = (async () => {
      await sleep(`${executionPlan.timeoutMinutes}m`);
      throw new Error("Workflow execution timeout");
    })();

    const executionPromise = executeAgentsAccordingToStrategy({
      session,
      plan: executionPlan,
      context,
      webhookPayload: input.webhookPayload,
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
          session,
          agentPlan: fallbackAgent,
          context,
          previousResults: agentResults,
          webhookPayload: input.webhookPayload,
        });

        finalAgentResults = [...agentResults, fallbackResult];
      }
    }

    const finalResult = await aggregateResultsStep({
      agentResults: finalAgentResults,
      plan: executionPlan,
      classification,
      triggerMessages: input.messages,
    });

    await sendEvent({
      type: "data-workflowAggregated",
      data: finalResult,
    });

    // TODO: Notify members (Implement in future)
    // if (classification.notifyMembers) {
    //   await notifyChatMembersStep({
    //     chatId: input.chatId,
    //     excludeUserId: triggerMessages.authorId,
    //     notification: {
    //       type: "orchestration_complete",
    //       agentCount: finalAgentResults.length,
    //       summary: finalResult.summary,
    //     },
    //   });
    // }

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

    throw error;
  }
}

// NOT a step - orchestration logic
async function executeAgentsAccordingToStrategy(params: {
  session: Session;
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
}) {
  const { plan, context, webhookPayload, session } = params;

  switch (plan.strategy) {
    case "sequential":
      return await executeSequential({
        session,
        plan,
        context,
        webhookPayload,
      });

    case "parallel":
      return await executeParallel(session, plan, context, webhookPayload);

    case "conditional":
      return await executeConditional(session, plan, context, webhookPayload);

    case "single":
      return await executeSingle(session, plan, context, webhookPayload);

    default:
      throw new Error(`Unknown execution strategy: ${plan.strategy}`);
  }
}

// NOT a step - orchestration logic
async function executeSequential(params: {
  session: Session;
  plan: ExecutionPlan;
  context: ChatContext;
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<AgentExecutionResult[]> {
  const { plan, context, webhookPayload, session } = params;
  const results: AgentExecutionResult[] = [];

  const sortedAgents = [...plan.selectedAgents].sort(
    (a, b) => a.order - b.order,
  );

  for (let i = 0; i < sortedAgents.length; i++) {
    const agentPlan = sortedAgents[i];

    const result = await executeAgentTaskStep({
      session,
      agentPlan,
      context,
      previousResults: results,
      webhookPayload,
    });

    results.push(result);

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
  session: Session,
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload?: OrchestrationInput["webhookPayload"],
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
          session,
          agentPlan,
          context,
          previousResults: results,
          webhookPayload,
        }),
      ),
    );

    results.push(...groupResults);

    if (plan.stopOnError && groupResults.some((r) => !r.success)) {
      break;
    }
  }

  return results;
}

// NOT a step - orchestration logic
async function executeConditional(
  session: Session,
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload: OrchestrationInput["webhookPayload"] | undefined,
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
          session,
          agentPlan,
          context,
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
  session: Session,
  plan: ExecutionPlan,
  context: ChatContext,
  webhookPayload?: OrchestrationInput["webhookPayload"],
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];

  const result = await executeAgentTaskStep({
    session,
    agentPlan,
    context,
    previousResults: [],
    webhookPayload,
  });

  return [result];
}
