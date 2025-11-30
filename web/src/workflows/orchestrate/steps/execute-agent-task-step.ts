import { Message } from "@/db";
import { CustomUIMessageChunk } from "@/lib/types";
import { convertToUIMessages } from "@/lib/utils";
import { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { google } from "@ai-sdk/google";
import { DurableAgent } from "@workflow/ai/agent";
import { convertToModelMessages } from "ai";
import { getWritable } from "workflow";
import { ExecutionPlan } from "./plan-agent-execution-step";

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  task: string;
  success: boolean;
  output?: string; // CRITICAL: Must capture the actual output
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
    previousResults,
    webhookPayload,
    triggerMessage,
  } = params;
  const writable = getWritable<CustomUIMessageChunk>();

  const startTime = new Date();
  const chatAgent = context.agents.find((a) => a.agentId === agentPlan.agentId);

  if (!chatAgent) {
    return {
      agentId: agentPlan.agentId,
      agentName: "Unknown Agent",
      task: agentPlan.task,
      success: false,
      error: "Agent not found in chat",
      startTime,
      endTime: new Date(),
      durationMs: 0,
    };
  }

  const agent = chatAgent.agent;

  try {
    // Build context from previous results
    let previousContext = "";
    if (previousResults.length > 0) {
      previousContext =
        "\n\n=== PREVIOUS AGENT OUTPUTS ===\n" +
        "These agents have already worked on this request. Use their outputs:\n\n" +
        previousResults
          .map((r, idx) => {
            const status = r.success ? "✓ SUCCESS" : "✗ FAILED";
            return `[Agent ${idx + 1}] ${r.agentName} (${status})
Task: ${r.task}
Output: ${r.output || "No output"}
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

    // Get conversation history (last 20 messages)
    const conversationHistory = context.messages.slice(-20);

    // Use custom instructions if available
    const instructions = chatAgent.customInstructions || agent.instructions;
    const temperature = chatAgent.customTemperature
      ? parseInt(chatAgent.customTemperature, 10) / 100
      : (agent.temperature || 70) / 100;

    const maxTokens = agent.maxTokens || 2000;

    // Build the system prompt
    const systemPrompt = `${instructions}

=== YOUR ASSIGNED TASK ===
${agentPlan.task}

=== EXECUTION CONTEXT ===
You are Agent #${previousResults.length + 1} in a multi-agent workflow.
Strategy: ${agentPlan.priority} priority
${previousResults.length > 0 ? `Previous agents have completed ${previousResults.length} task(s) before you.` : "You are the first agent."}
${agentPlan.dependsOn && agentPlan.dependsOn.length > 0 ? `\nYour work depends on: ${agentPlan.dependsOn.length} previous agent(s)` : ""}

=== INSTRUCTIONS ===
1. Review the original user request carefully
2. ${previousResults.length > 0 ? "Consider the outputs from previous agents - build upon their work" : "Start fresh"}
3. Focus on your assigned task: "${agentPlan.task}"
4. Provide clear, actionable output
5. If building on previous work, reference it explicitly
${webhookContext}${previousContext}

Provide a focused response for YOUR specific task. Be concise but complete.`;

    // Create durable agent
    const durableAgent = new DurableAgent({
      model: async () => google(agent.model || "gemini-2.5-flash"),
      system: systemPrompt,
    });

    // Send agent started event
    await sendAgentStartEvent(writable, {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
    });

    // Stream the agent response
    const result = await durableAgent.stream({
      messages: [
        ...convertToModelMessages(convertToUIMessages(conversationHistory)),
      ],
      writable,
    });

    // CRITICAL: Extract the actual output from the messages array
    // The last message should be the assistant's response
    const assistantMessages = result.messages.filter(
      (msg) => msg.role === "assistant",
    );
    const lastAssistantMessage =
      assistantMessages[assistantMessages.length - 1];

    // Extract text content from the message
    let output = "";
    if (lastAssistantMessage) {
      if (typeof lastAssistantMessage.content === "string") {
        output = lastAssistantMessage.content;
      } else if (Array.isArray(lastAssistantMessage.content)) {
        // Handle multi-part content (text, tool calls, etc.)
        output = lastAssistantMessage.content
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n");
      }
    }

    const endTime = new Date();

    // Send agent completed event
    await sendAgentCompletedEvent(writable, {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: true,
      output,
      durationMs: endTime.getTime() - startTime.getTime(),
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: true,
      output, // CRITICAL: Return the actual output extracted from messages
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      // Note: Token count and cost tracking would require additional implementation
      // We may need to add custom usage tracking or parse from model responses
    };
  } catch (error) {
    const endTime = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Send error event
    await sendAgentErrorEvent(writable, {
      agentId: agent.id,
      agentName: agent.name,
      error: errorMessage,
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: false,
      error: errorMessage,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }
}

// Helper functions for sending events (NOT steps)
async function sendAgentStartEvent(
  writable: WritableStream<CustomUIMessageChunk>,
  data: { agentId: string; agentName: string; task: string },
) {
  const writer = writable.getWriter();
  try {
    await writer.write({
      type: "data-workflowAgentStarted",
      data,
    });
  } finally {
    writer.releaseLock();
  }
}

async function sendAgentCompletedEvent(
  writable: WritableStream<CustomUIMessageChunk>,
  data: {
    agentId: string;
    agentName: string;
    task: string;
    success: boolean;
    output?: string;
    durationMs: number;
  },
) {
  const writer = writable.getWriter();
  try {
    await writer.write({
      type: "data-workflowAgentCompleted",
      data: {
        agentId: data.agentId,
        agentName: data.agentName,
        task: data.task,
        success: data.success,
        startTime: new Date(),
        endTime: new Date(),
        durationMs: data.durationMs,
      },
    });
  } finally {
    writer.releaseLock();
  }
}

async function sendAgentErrorEvent(
  writable: WritableStream<CustomUIMessageChunk>,
  data: { agentId: string; agentName: string; error: string },
) {
  const writer = writable.getWriter();
  try {
    await writer.write({
      type: "data-workflowError",
      data: {
        error: data.error,
        agentId: data.agentId,
      },
    });
  } finally {
    writer.releaseLock();
  }
}
