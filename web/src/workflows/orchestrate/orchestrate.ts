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
import { FatalError, fetch, getWritable } from "workflow";
import { classifyRequestStep } from "./steps/classify-request-step";

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

export async function orchestrateWorkflow(input: OrchestrationInput) {
  "use workflow";

  // Enable AI SDK calls as workflow steps
  globalThis.fetch = fetch;

  // Getting writable stream ONCE at workflow level
  const workflowStream = getWritable<WorkflowStreamEvent>();

  const startTime = Date.now();

  try {
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

    await emitEventStep(workflowStream, {
      type: "workflow-plan",
      data: executionPlan,
    });

    // Step 7: Validate execution plan
    if (executionPlan.selectedAgents.length === 0) {
      return {
        success: false,
        reason: "No suitable agents found for this request",
        classification,
        reasoning: executionPlan.reasoning,
      };
    }

    // Step 8: Execute agents according to strategy
    const agentResults = await executeAgentsAccordingToStrategy({
      plan: executionPlan,
      context,
      triggerMessage,
      workflowStream,
      webhookPayload: input.webhookPayload,
    });

    // Step 9: Aggregate and synthesize results
    const finalResult = await aggregateResultsStep({
      agentResults,
      plan: executionPlan,
      classification,
      triggerMessage,
    });

    await emitEventStep(workflowStream, {
      type: "workflow-aggregated",
      data: finalResult,
    });

    // Step 10: Log orchestration for analytics
    await createOrchestrationLogStep({
      chatId: input.chatId,
      messageId: input.messageId,
      classification,
      executionPlan,
      agentResults,
      finalResult,
      executionTimeMs: Date.now() - startTime,
      success: true,
    });

    await emitEventStep(workflowStream, {
      type: "workflow-completed",
      data: { success: true, executionTimeMs: Date.now() - startTime },
    });

    await closeStreamStep(workflowStream);

    // Step 11: Notify chat members if needed
    if (classification.notifyMembers) {
      await notifyChatMembersStep({
        chatId: input.chatId,
        excludeUserId: triggerMessage.authorId,
        notification: {
          type: "orchestration_complete",
          agentCount: agentResults.length,
          summary: finalResult.summary,
        },
      });
    }

    return {
      success: true,
      classification,
      executionPlan,
      agentResults,
      finalResult,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    // Log failed orchestration
    await createOrchestrationLogStep({
      chatId: input.chatId,
      messageId: input.messageId,
      classification: null,
      executionPlan: null,
      agentResults: [],
      finalResult: null,
      executionTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
  const results: AgentExecutionResult[] = [];

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
        results,
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
      webhookPayload,
      workflowStream, // Pass stream for progress
    });

    // Emit agent completed
    await emitEventStep(workflowStream, {
      type: "workflow-agent-completed",
      data: result,
    });

    results.push(result);

    if (!result.success && plan.stopOnError) {
      // Handle remaining agents...
      break;
    }
  }

  return results;
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
          webhookPayload,
          workflowStream,
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
  results: AgentExecutionResult[],
): Promise<AgentExecutionResult[]> {
  const executed = new Set<string>();
  const agentMap = new Map(plan.selectedAgents.map((a) => [a.agentId, a]));
  const resultMap = new Map<string, AgentExecutionResult>();

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
        // Validate dependency exists
        if (!agentMap.has(depId)) {
          console.warn(
            `Agent ${agent.agentId} depends on non-existent agent ${depId}`,
          );
          return false;
        }

        const isExecuted = executed.has(depId);
        // Also check if the dependency was successful
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
          `Cannot execute remaining agents due to unmet dependencies or failures:`,
        );

        // Provide detailed diagnostics
        for (const agent of unexecuted) {
          const deps = agent.dependsOn || [];
          const unmetDeps = deps.filter((d) => {
            const depResult = resultMap.get(d);
            return !depResult || !depResult.success;
          });

          console.warn(
            `  - ${agent.agentId}: waiting for [${unmetDeps.join(", ")}]`,
          );
        }

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

    // Execute ready agents in parallel (they have no dependencies on each other)
    const batchResults = await Promise.all(
      ready.map((agentPlan) =>
        executeAgentTaskStep({
          agentPlan,
          context,
          triggerMessage,
          previousResults: results,
          workflowStream,
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
    workflowStream,
    webhookPayload,
  });

  return [result];
}
