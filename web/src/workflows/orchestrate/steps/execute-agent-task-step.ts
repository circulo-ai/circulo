import { Message } from "@/db";
import { ChatTools, CustomUIDataTypes, WorkflowStreamEvent } from "@/lib/types";
import { convertToUIMessages } from "@/lib/utils";
import { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, UIMessagePart } from "ai";
import { FatalError } from "workflow";
import { ExecutionPlan } from "./plan-agent-execution-step";

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  task: string;
  success: boolean;
  parts: UIMessagePart<CustomUIDataTypes, ChatTools>[];
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
  emitProgress: (event: WorkflowStreamEvent) => Promise<void>;
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<AgentExecutionResult> {
  "use step";

  const { agentPlan, context, previousResults, webhookPayload, emitProgress } =
    params;

  const startTime = new Date();
  const chatAgent = context.agents.find((a) => a.agentId === agentPlan.agentId);

  if (!chatAgent) {
    return {
      agentId: agentPlan.agentId,
      agentName: "Unknown Agent",
      task: agentPlan.task,
      success: false,
      parts: [],
      output: "",
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

    // Build dependency context
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

        dependencyContext += `\n\nIMPORTANT: If any dependency output appears incomplete or truncated, note this in your response and work with what's available, or request a re-run.`;
      }
    }

    // Get conversation history (last 20 messages)
    const conversationHistory = context.messages.slice(-20);

    // Use custom instructions if available
    const instructions = chatAgent.customInstructions || agent.instructions;
    const temperature = chatAgent.customTemperature
      ? parseInt(chatAgent.customTemperature, 10) / 100
      : (agent.temperature || 70) / 100;

    const maxTokens = agent.maxTokens || 2000;

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

    // Variables to capture stream results
    let finalText = "";
    let finalParts: UIMessagePart<CustomUIDataTypes, ChatTools>[] = [];
    let finalUsage: any = undefined;
    let finalFinishReason: string | undefined;

    // Create a promise that resolves when onFinish is called
    const finishPromise = new Promise<ReturnType<typeof streamText>>(
      (resolve) => {
        const result = streamText({
          model: google(agent.model || "gemini-2.5-flash"),
          temperature,
          maxOutputTokens: maxTokens,
          messages: [
            ...convertToModelMessages(convertToUIMessages(conversationHistory)),
          ],
          system: systemPrompt,
          onChunk: async ({ chunk }) => {
            // Emit progress for text deltas using the provided helper
            if (chunk.type === "text-delta") {
              try {
                await emitProgress({
                  type: "workflow-agent-progress",
                  data: {
                    agentId: agent.id,
                    progress: chunk.text,
                  },
                });
              } catch (e) {
                // Log but don't fail the agent execution
                console.warn("Failed to emit progress:", e);
              }
            }
          },
          onFinish: ({ text, usage, finishReason, providerMetadata }) => {
            finalText = text;
            finalUsage = usage;
            finalFinishReason = finishReason;

            // Build parts array from the response
            finalParts = [
              {
                type: "text",
                text: text,
              },
            ];

            // Add any additional parts from provider metadata
            // (for artifacts, images, etc. if your model returns them)
            // if (providerMetadata?.parts) {
            //   finalParts.push(...(providerMetadata.parts as any[]));
            // }

            resolve(result);
          },
        });

        // Start consuming the stream to trigger callbacks
        result.text.catch((error) => {
          console.error("Stream error:", error);
          resolve(result); // Resolve even on error so we don't hang
        });
      },
    );

    // Wait for the stream to complete
    await finishPromise;

    const output = finalText;

    console.log("=== AGENT EXECUTION DEBUG ===");
    console.log("Agent:", agent.name);
    console.log("output length:", output?.length || 0);
    console.log("parts count:", finalParts.length);
    console.log("usage:", finalUsage);
    console.log("finishReason:", finalFinishReason);
    console.log("output preview:", output?.substring(0, 100));
    console.log("==============================");

    // Validate we got content
    if (!output || output.trim().length === 0) {
      throw new FatalError(
        `Agent produced no output. ` +
          `finishReason: ${finalFinishReason}, ` +
          `tokens: ${finalUsage?.totalTokens || 0}`,
      );
    }

    const endTime = new Date();

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: true,
      parts: finalParts,
      output: output.trim(),
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      tokenCount: finalUsage?.totalTokens,
    };
  } catch (error) {
    const endTime = new Date();

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: false,
      parts: [],
      output: "",
      error: error instanceof Error ? error.message : String(error),
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }
}
