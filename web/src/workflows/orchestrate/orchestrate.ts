import { Message } from "@/db";
import { WorkflowStreamEvent } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
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
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { FatalError, fetch, getWritable, sleep } from "workflow";
import { classifyRequestStep } from "./steps/classify-request-step";

const logger = console;

// Helper to safely emit events with proper lock management
async function emitEventStep(
  stream: WritableStream<WorkflowStreamEvent>,
  event: WorkflowStreamEvent,
) {
  "use step";

  const writer = stream.getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function closeStreamStep(stream: WritableStream<WorkflowStreamEvent>) {
  "use step";
  await stream.close();
}

// Validate execution plan for circular dependencies
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

  // Getting writable stream ONCE at workflow level
  const workflowStream = getWritable<WorkflowStreamEvent>();

  const startTime = Date.now();
  let errorStack: string | undefined;

  try {
    logger.info("Workflow Started");
    await emitEventStep(workflowStream, {
      type: "workflow-started",
      data: {
        workflowId: generateUUID(),
        chatId: input.chatId,
        messageId: input.messageId,
      },
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
      await emitEventStep(workflowStream, {
        type: "workflow-error",
        data: { error: "No agents available" },
      });
      return {
        success: false,
        reason: "No agents available in this chat",
      };
    }

    // Step 5: Classify the request (understand intent, complexity, domains)
    const classification = await classifyRequestStep({
      message: triggerMessage,
      messages: context.messages,
      triggerType: input.triggerType,
      webhookPayload: input.webhookPayload,
    });

    logger.info("Classified", classification);

    await emitEventStep(workflowStream, {
      type: "workflow-classification",
      data: classification,
    });

    // Step 6: Plan agent execution (select agents, determine order/parallelism)
    const executionPlan = await planAgentExecutionStep({
      classification,
      agents: context.agents,
      triggerMessage,
      webhookPayload: input.webhookPayload,
    });

    logger.info("Execution Planned", executionPlan);

    await emitEventStep(workflowStream, {
      type: "workflow-plan",
      data: executionPlan,
    });

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

    // Step 8: Execute agents according to strategy (with timeout)
    const timeoutPromise = (async () => {
      await sleep(`${executionPlan.timeoutMinutes}m`);
      throw new Error("Workflow execution timeout");
    })();

    const executionPromise = executeAgentsAccordingToStrategy({
      plan: executionPlan,
      context,
      triggerMessage,
      workflowStream,
      webhookPayload: input.webhookPayload,
    });

    const agentResults = await Promise.race([executionPromise, timeoutPromise]);

    logger.info("Agent Results according to strategy", agentResults);

    // Step 9: Check if we should try fallback agent
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
          emitProgress: (event) => emitEventStep(workflowStream, event),
          webhookPayload: input.webhookPayload,
        });

        finalAgentResults = [...agentResults, fallbackResult];
      }
    }

    // Step 10: Aggregate and synthesize results
    const finalResult = await aggregateResultsStep({
      agentResults: finalAgentResults,
      plan: executionPlan,
      classification,
      triggerMessage,
    });

    await emitEventStep(workflowStream, {
      type: "workflow-aggregated",
      data: finalResult,
    });

    // Step 11: Log orchestration for analytics
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

    await emitEventStep(workflowStream, {
      type: "workflow-completed",
      data: { success: true, executionTimeMs: Date.now() - startTime },
    });

    await closeStreamStep(workflowStream);

    // Step 12: Notify chat members if needed
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
    // Capture error stack
    if (error instanceof Error) {
      errorStack = error.stack;
    }

    // Log failed orchestration
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

    await emitEventStep(workflowStream, {
      type: "workflow-error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });

    await closeStreamStep(workflowStream);

    throw error;
  }
}

// Execute agents based on strategy (sequential, parallel, conditional)
async function executeAgentsAccordingToStrategy(params: {
  plan: ExecutionPlan;
  context: ChatContext;
  triggerMessage: Message;
  workflowStream: WritableStream<WorkflowStreamEvent>;
  webhookPayload?: OrchestrationInput["webhookPayload"];
}) {
  const { plan, context, triggerMessage, workflowStream, webhookPayload } =
    params;

  switch (plan.strategy) {
    case "sequential":
      return await executeSequential({
        plan,
        context,
        triggerMessage,
        workflowStream,
        webhookPayload,
      });

    case "parallel":
      return await executeParallel(
        plan,
        context,
        triggerMessage,
        workflowStream,
        webhookPayload,
      );

    case "conditional":
      return await executeConditional(
        plan,
        context,
        triggerMessage,
        workflowStream,
        webhookPayload,
      );

    case "single":
      return await executeSingle(
        plan,
        context,
        triggerMessage,
        workflowStream,
        webhookPayload,
      );

    default:
      throw new Error(`Unknown execution strategy: ${plan.strategy}`);
  }
}

async function executeSequential(params: {
  plan: ExecutionPlan;
  context: ChatContext;
  triggerMessage: Message;
  workflowStream: WritableStream<WorkflowStreamEvent>;
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<AgentExecutionResult[]> {
  "use step";

  const { plan, context, triggerMessage, webhookPayload, workflowStream } =
    params;
  const results: AgentExecutionResult[] = [];

  const sortedAgents = [...plan.selectedAgents].sort(
    (a, b) => a.order - b.order,
  );

  for (let i = 0; i < sortedAgents.length; i++) {
    const agentPlan = sortedAgents[i];
    const chatAgent = context.agents.find(
      (a) => a.agentId === agentPlan.agentId,
    );

    // Emit agent started
    await emitEventStep(workflowStream, {
      type: "workflow-agent-started",
      data: {
        agentId: agentPlan.agentId,
        agentName: chatAgent?.agent.name || "Unknown Agent",
        task: agentPlan.task,
      },
    });

    const result = await executeAgentTaskStep({
      agentPlan,
      context,
      triggerMessage,
      previousResults: results,
      emitProgress: (event) => emitEventStep(workflowStream, event),
      webhookPayload,
    });

    // Emit agent completed
    await emitEventStep(workflowStream, {
      type: "workflow-agent-completed",
      data: result,
    });

    results.push(result);

    if (!result.success && plan.stopOnError) {
      // Mark remaining agents as skipped
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
          output: "",
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

// Mutex for coordinating parallel writes
class StreamMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

async function executeParallel(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  workflowStream: WritableStream<WorkflowStreamEvent>,
  webhookPayload?: OrchestrationInput["webhookPayload"],
): Promise<AgentExecutionResult[]> {
  // Group agents by parallel group
  const groups = new Map<number, typeof plan.selectedAgents>();

  for (const agent of plan.selectedAgents) {
    const groupId = agent.parallelGroup ?? 0;
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId)!.push(agent);
  }

  const results: AgentExecutionResult[] = [];
  const mutex = new StreamMutex();

  // Execute groups in order (agents within each group run in parallel)
  const sortedGroupIds = Array.from(groups.keys()).sort((a, b) => a - b);

  for (const groupId of sortedGroupIds) {
    const groupAgents = groups.get(groupId)!;

    const groupResults = await Promise.all(
      groupAgents.map((agentPlan) =>
        executeAgentTaskStep({
          agentPlan,
          context,
          triggerMessage,
          previousResults: results,
          emitProgress: (event) =>
            mutex.execute(() => emitEventStep(workflowStream, event)),
          webhookPayload,
        }),
      ),
    );

    results.push(...groupResults);

    // Check for failures
    if (plan.stopOnError && groupResults.some((r) => !r.success)) {
      break;
    }
  }

  return results;
}

async function executeConditional(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  workflowStream: WritableStream<WorkflowStreamEvent>,
  webhookPayload: OrchestrationInput["webhookPayload"] | undefined,
): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];
  const executed = new Set<string>();
  const agentMap = new Map(plan.selectedAgents.map((a) => [a.agentId, a]));
  const resultMap = new Map<string, AgentExecutionResult>();
  const mutex = new StreamMutex();

  // Maximum iterations to prevent infinite loops
  const maxIterations = plan.selectedAgents.length * 2;
  let iterations = 0;

  // Execute agents based on dependencies
  while (
    executed.size < plan.selectedAgents.length &&
    iterations < maxIterations
  ) {
    iterations++;

    // Find agents ready to execute (all dependencies satisfied)
    const ready = plan.selectedAgents.filter((agent) => {
      if (executed.has(agent.agentId)) return false;

      // Check if all dependencies are satisfied
      const dependencies = agent.dependsOn || [];
      const dependenciesMet = dependencies.every((depId) => {
        const isExecuted = executed.has(depId);
        const depResult = resultMap.get(depId);
        return isExecuted && depResult?.success;
      });

      return dependenciesMet;
    });

    if (ready.length === 0) {
      // No more agents can execute
      const unexecuted = plan.selectedAgents.filter(
        (a) => !executed.has(a.agentId),
      );

      if (unexecuted.length > 0) {
        console.warn(
          `Cannot execute remaining agents due to unmet dependencies or failures`,
        );

        // Add failed results for unexecuted agents
        for (const agent of unexecuted) {
          const chatAgent = context.agents.find(
            (ca) => ca.agentId === agent.agentId,
          );
          const failedResult: AgentExecutionResult = {
            agentId: agent.agentId,
            agentName: chatAgent?.agent.name || "Unknown",
            task: agent.task,
            success: false,
            output: "",
            error: "Dependencies not met or previous agent failed",
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

    // Execute ready agents in parallel
    const batchResults = await Promise.all(
      ready.map((agentPlan) =>
        executeAgentTaskStep({
          agentPlan,
          context,
          triggerMessage,
          previousResults: results,
          emitProgress: (event) =>
            mutex.execute(() => emitEventStep(workflowStream, event)),
          webhookPayload,
        }),
      ),
    );

    // Store results
    for (const result of batchResults) {
      results.push(result);
      resultMap.set(result.agentId, result);
      executed.add(result.agentId);
    }

    // Check for failures with stop-on-error
    if (plan.stopOnError && batchResults.some((r) => !r.success)) {
      console.log("Stopping execution due to agent failure (stopOnError=true)");

      // Mark remaining agents as skipped
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
          output: "",
          error: "Execution stopped due to previous agent failure",
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

  if (iterations >= maxIterations) {
    console.error("Maximum iterations reached - possible circular dependency");
  }

  return results;
}

async function executeSingle(
  plan: ExecutionPlan,
  context: ChatContext,
  triggerMessage: Message,
  workflowStream: WritableStream<WorkflowStreamEvent>,
  webhookPayload?: OrchestrationInput["webhookPayload"],
): Promise<AgentExecutionResult[]> {
  const agentPlan = plan.selectedAgents[0];

  const result = await executeAgentTaskStep({
    agentPlan,
    context,
    triggerMessage,
    previousResults: [],
    emitProgress: (event) => emitEventStep(workflowStream, event),
    webhookPayload,
  });

  return [result];
}
