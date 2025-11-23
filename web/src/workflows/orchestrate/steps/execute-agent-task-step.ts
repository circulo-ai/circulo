// workflows/orchestration/steps/execute-agent-task-step.ts
import { Message } from "@/db";
import { convertToUIMessages } from "@/lib/utils";
import { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { google } from "@ai-sdk/google";
import { convertToModelMessages, generateText } from "ai";
import { ExecutionPlan } from "./plan-agent-execution-step";

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  task: string;
  success: boolean;
  output: string;
  error?: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  tokenCount?: number;
  cost?: number;
}

export async function executeAgentTaskStep(params: {
  agentPlan: ExecutionPlan["selectedAgents"][0];
  context: ChatContext;
  triggerMessage: Message;
  previousResults: AgentExecutionResult[];
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<AgentExecutionResult> {
  "use step";

  const {
    agentPlan,
    context,
    triggerMessage,
    previousResults,
    webhookPayload,
  } = params;

  const startTime = new Date();
  const chatAgent = context.agents.find((a) => a.agentId === agentPlan.agentId);

  if (!chatAgent) {
    return {
      agentId: agentPlan.agentId,
      agentName: "Unknown Agent",
      task: agentPlan.task,
      success: false,
      output: "",
      error: "Agent not found in chat",
      startTime,
      endTime: new Date(),
      durationMs: 0,
    };
  }

  const agent = chatAgent.agent;

  try {
    // Build comprehensive context from previous agent results
    let previousContext = "";
    if (previousResults.length > 0) {
      previousContext =
        "\n\n=== PREVIOUS AGENT OUTPUTS ===\n" +
        "These agents have already worked on this request. Use their outputs to inform your work:\n\n" +
        previousResults
          .map((r, idx) => {
            const status = r.success ? "✓ SUCCESS" : "✗ FAILED";
            return `[Agent ${idx + 1}] ${r.agentName} (${status})
Task: ${r.task}
Output: ${r.output}
${r.error ? `Error: ${r.error}` : ""}
---`;
          })
          .join("\n\n");
    }

    // Build webhook context
    let webhookContext = "";
    if (webhookPayload) {
      webhookContext = `\n\n=== WEBHOOK EVENT TRIGGER ===
Source: ${webhookPayload.source}
Event: ${webhookPayload.event}
Data: ${JSON.stringify(webhookPayload.data, null, 2)}
---`;
    }

    // Build dependency context if this agent depends on specific previous agents
    let dependencyContext = "";
    if (agentPlan.dependsOn && agentPlan.dependsOn.length > 0) {
      const dependencyResults = previousResults.filter((r) =>
        agentPlan.dependsOn!.includes(r.agentId),
      );

      if (dependencyResults.length > 0) {
        dependencyContext =
          `\n\n=== REQUIRED INPUTS FROM DEPENDENCIES ===
Your task depends on the following agent outputs. Pay special attention to these:\n\n` +
          dependencyResults
            .map(
              (r) => `${r.agentName}:
${r.output}`,
            )
            .join("\n\n---\n\n");
      }
    }

    // Get conversation history (last 20 messages)
    const conversationHistory = context.messages.slice(-20);

    // Use custom instructions if available
    const instructions = chatAgent.customInstructions || agent.instructions;
    const temperature = chatAgent.customTemperature
      ? parseInt(chatAgent.customTemperature, 10) / 100
      : (agent.temperature || 70) / 100;

    // Build the context-aware system prompt
    const systemPrompt = `${instructions}

=== YOUR ASSIGNED TASK ===
${agentPlan.task}

=== EXECUTION CONTEXT ===
You are Agent #${previousResults.length + 1} in a multi-agent workflow.
Strategy: ${agentPlan.priority} priority
${previousResults.length > 0 ? `Previous agents have completed ${previousResults.length} task(s) before you.` : "You are the first agent to work on this request."}
${agentPlan.dependsOn && agentPlan.dependsOn.length > 0 ? `\nYour work depends on: ${agentPlan.dependsOn.length} previous agent(s)` : ""}

=== INSTRUCTIONS ===
1. Review the original user request carefully
2. ${previousResults.length > 0 ? "Consider the outputs from previous agents - build upon their work, don't duplicate it" : "Start fresh with the user's request"}
3. ${dependencyContext ? "Pay special attention to the dependency outputs - they contain inputs you need" : ""}
4. Focus specifically on your assigned task: "${agentPlan.task}"
5. Provide clear, actionable output that the user can understand
6. If you're building on previous work, reference it explicitly
7. If previous agents made mistakes, acknowledge and correct them
${webhookContext}${previousContext}${dependencyContext}

Provide a focused response for YOUR specific task. Be concise but complete.`;

    // Execute the agent with full context
    const result = await generateText({
      model: google(agent.model || "gemini-2.0-flash-exp"),
      temperature,
      maxOutputTokens: agent.maxTokens || 2000,
      messages: [
        ...convertToModelMessages(convertToUIMessages(conversationHistory)),
      ],
      system: systemPrompt,
    });

    const endTime = new Date();

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: true,
      output: result.text,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      tokenCount: result.usage?.totalTokens,
    };
  } catch (error) {
    const endTime = new Date();

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }
}
