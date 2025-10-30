import { Agent } from "@/db/schema";
import {
  applyClassification,
  classifyUserPrompt,
  enhanceSystemPromptWithClassification,
  PromptClassification,
} from "@/lib/prompts/classifier";
import { buildMessageHistory, buildSystemPrompt } from "@/lib/prompts/prompts";
import { calculateCostFromUsage } from "@/lib/server-utils";
import { ChatService, type UsageMetrics } from "@/services/chat-service";
import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { logger, metadata, task } from "@trigger.dev/sdk";
import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai";
import { streamText } from "ai";

interface ProcessChatPayload {
  chatId: string;
  messageId: string;
  userId: string;
}

interface AgentProcessingResult {
  agentId: string;
  agentName: string;
  content: string;
  uiMessageParts: UIMessage[];
  usage: UsageMetrics;
  success: boolean;
  error?: string;
}

interface StreamUpdate {
  type:
    | "agent_processing"
    | "agent_response"
    | "agent_error"
    | "processing_complete"
    | "processing_error"
    | "ui_message_part"
    | "classification_complete";
  timestamp: string;
  agentId?: string;
  agentName?: string;
  isTargeted?: boolean;
  content?: string;
  fullContent?: string;
  messagePart?: UIMessage;
  usage?: UsageMetrics;
  status?: "starting" | "completed" | "failed";
  error?: string;
  totalCost?: number;
  processedAgents?: number;
  successfulAgents?: number;
  classification?: {
    interactionType: string;
    agentCount: number;
    confidence: number;
    reasoning: string;
  };
}

// Configuration
const DEBT_LIMIT = -1.0;
const COST_MULTIPLIER = 1.2;

/**
 * Main task for processing chat messages with intelligent agent selection
 */
export const processChatTask = task({
  id: "process-chat",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  machine: {
    preset: "small-1x",
  },
  run: async (payload: ProcessChatPayload, { ctx }) => {
    const { chatId, messageId, userId } = payload;

    logger.info("Starting chat processing", {
      chatId,
      messageId,
      userId,
      runId: ctx.run.id,
    });

    return await metadata.stream(
      "chat-updates",
      (async function* () {
        try {
          // Get chat with all related data
          const chat = await ChatService.getChatById(chatId, userId);
          if (!chat) {
            yield {
              type: "processing_error",
              error: `No chat found with id: ${chatId}`,
              status: "failed",
              timestamp: new Date().toISOString(),
            };
            throw new Error(`Chat ${chatId} not found or access denied`);
          }

          logger.info("Processing chat with agents", {
            chatId,
            agentCount: chat.agents.length,
            enabledAgents: chat.agents.filter((a) => a.enabled).length,
          });

          // Get enabled agents sorted by speak order
          const enabledAgents = chat.agents
            .filter((agent) => agent.enabled && !agent.deleted)
            .sort((a, b) => a.speakOrder - b.speakOrder);

          if (enabledAgents.length === 0) {
            logger.warn("No enabled agents found for chat", { chatId });
            yield {
              type: "processing_error",
              error: "No enabled agents found",
              status: "failed",
              timestamp: new Date().toISOString(),
            };
            return { success: false, error: "No enabled agents found" };
          }

          // ========== INTELLIGENT PROMPT CLASSIFICATION ==========

          // Get the latest user message to classify
          const latestUserMessage = chat.messages
            .filter((msg) => msg.userId)
            .slice(-1)[0];

          if (!latestUserMessage) {
            throw new Error("No user message found to process");
          }

          logger.info("Classifying user prompt", {
            chatId,
            messageId: latestUserMessage.id,
            promptLength: latestUserMessage.content.length,
            availableAgents: enabledAgents.length,
          });

          // Classify the prompt to determine interaction strategy
          const classification = await classifyUserPrompt(
            latestUserMessage.content,
            enabledAgents,
            chat.style,
            chat.instructions || undefined,
          );

          logger.info("Prompt classification complete", {
            chatId,
            interactionType: classification.interactionType,
            targetedAgents: classification.targetedAgents,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
          });

          // Apply classification to filter and order agents
          const { agentsToRespond, shouldUseRoundtable, specialHandling } =
            applyClassification(classification, enabledAgents);

          logger.info("Agents selected for response", {
            chatId,
            originalCount: enabledAgents.length,
            selectedCount: agentsToRespond.length,
            shouldUseRoundtable,
            agentNames: agentsToRespond.map((a) => a.name),
            specialHandling: specialHandling?.type,
          });

          // Yield classification info to frontend
          yield {
            type: "classification_complete",
            classification: {
              interactionType: classification.interactionType,
              agentCount: agentsToRespond.length,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            },
            timestamp: new Date().toISOString(),
          };

          // ========== END CLASSIFICATION ==========

          // Check user balance - allow negative balance up to debt limit
          const userWallet = await ChatService.getUserWallet(userId);
          const currentBalance = parseFloat(userWallet.balance);

          if (currentBalance < DEBT_LIMIT) {
            const error = `Insufficient balance. Your balance is $${currentBalance.toFixed(2)}. Please add funds to continue.`;
            logger.warn("User balance below debt limit", {
              userId,
              currentBalance,
              debtLimit: DEBT_LIMIT,
            });

            yield {
              type: "processing_error",
              error,
              status: "failed",
              timestamp: new Date().toISOString(),
            };
            return { success: false, error };
          }

          // Build message history for context
          const messageHistory = buildMessageHistory(chat.messages);

          // Process each agent sequentially
          const results: AgentProcessingResult[] = [];
          let totalCost = 0;

          for (const agent of agentsToRespond) {
            try {
              logger.info("Processing agent", {
                agentId: agent.id,
                agentName: agent.name,
                speakOrder: agent.speakOrder,
              });

              // Check if this agent was specifically targeted
              const isTargeted =
                classification.targetedAgents.includes(agent.id) ||
                classification.targetedAgents.includes(agent.name);

              // Enhance instructions with classification context
              const enhancedInstructions =
                enhanceSystemPromptWithClassification(
                  chat.instructions || "",
                  classification,
                  isTargeted,
                  agent.name,
                );

              // Send streaming update
              yield {
                type: "agent_processing",
                agentId: agent.id,
                agentName: agent.name,
                isTargeted,
                status: "starting",
                timestamp: new Date().toISOString(),
              };

              // Process agent response with streaming
              const agentResponseGenerator = processAgentResponseWithStreaming(
                agent,
                messageHistory,
                enhancedInstructions,
                chat.style,
                classification,
              );

              let result: AgentProcessingResult | null = null;
              for await (const update of agentResponseGenerator) {
                if (update.type === "result") {
                  result = update.data;
                  if (result) {
                    logger.info("Received result from agent generator", {
                      agentId: agent.id,
                      agentName: agent.name,
                      resultSuccess: result.success,
                      contentLength: result.content.length,
                      hasUsage: !!result.usage,
                      usage: result.usage,
                    });
                  }
                } else {
                  yield update;
                }
              }

              if (!result) {
                throw new Error("No result received from agent processing");
              }

              if (result.success) {
                // CRITICAL: Validate that agent actually produced content
                const hasContent =
                  result.content && result.content.trim().length > 0;

                if (!hasContent) {
                  logger.warn(
                    "Agent produced no content, skipping save and charge",
                    {
                      agentId: agent.id,
                      agentName: agent.name,
                      chatId,
                      contentLength: result.content?.length || 0,
                      usage: result.usage,
                    },
                  );

                  // Send informational update (not an error)
                  yield {
                    type: "agent_response",
                    agentId: agent.id,
                    agentName: agent.name,
                    content: "",
                    usage: {
                      inputTokens: 0,
                      outputTokens: 0,
                      model: agent.model,
                      cost: 0,
                    },
                    status: "completed",
                    timestamp: new Date().toISOString(),
                  };

                  // Mark as successful but skip database save and charging
                  results.push({
                    ...result,
                    success: true,
                    content: "",
                    usage: {
                      inputTokens: 0,
                      outputTokens: 0,
                      model: agent.model,
                      cost: 0,
                    },
                  });

                  // Continue to next agent without adding to message history
                  continue;
                }

                // Apply cost multiplier for system profit
                const baseCost = result.usage.cost;
                const finalCost = baseCost * COST_MULTIPLIER;

                logger.info("Applying cost multiplier", {
                  agentId: agent.id,
                  agentName: agent.name,
                  baseCost,
                  multiplier: COST_MULTIPLIER,
                  finalCost,
                });

                // Save the agent message to the database
                logger.info("Attempting to save agent message to database", {
                  agentId: agent.id,
                  agentName: agent.name,
                  chatId,
                  contentLength: result.content.length,
                  hasUsage: !!result.usage,
                  hasUiMessageParts: !!result.uiMessageParts,
                  uiMessagePartsCount: result.uiMessageParts?.length || 0,
                  usage: result.usage,
                });

                try {
                  const savedMessage = await ChatService.addAgentMessage(
                    chatId,
                    agent.id,
                    result.content,
                    {
                      ...result.usage,
                      cost: finalCost,
                    },
                    undefined,
                    result.uiMessageParts,
                  );

                  logger.info("Agent message successfully saved to database", {
                    agentId: agent.id,
                    agentName: agent.name,
                    messageId: savedMessage.id,
                    messageLength: result.content.length,
                    tokenCount:
                      result.usage.inputTokens + result.usage.outputTokens,
                    baseCost,
                    finalCost,
                    savedAt: new Date().toISOString(),
                  });
                } catch (messageError) {
                  logger.error("Failed to save agent message to database", {
                    agentId: agent.id,
                    agentName: agent.name,
                    chatId,
                    error:
                      messageError instanceof Error
                        ? messageError.message
                        : String(messageError),
                    stack:
                      messageError instanceof Error
                        ? messageError.stack
                        : undefined,
                    contentPreview: result.content.substring(0, 100),
                    usage: result.usage,
                  });
                  throw messageError;
                }

                // Process usage and create transaction with final cost
                try {
                  await ChatService.processUsage(userId, chatId, {
                    ...result.usage,
                    cost: finalCost,
                  });
                } catch (usageError) {
                  logger.error("Failed to process usage and charge user", {
                    agentId: agent.id,
                    agentName: agent.name,
                    chatId,
                    userId,
                    cost: finalCost,
                    error:
                      usageError instanceof Error
                        ? usageError.message
                        : String(usageError),
                  });
                  throw usageError;
                }

                // Add to message history for next agents with agent name context
                messageHistory.push({
                  role: "assistant",
                  content: `[${agent.name.replace(/\[|\]/g, "")}]: ${result.content}`,
                });

                totalCost += finalCost;

                // Send completion update with final cost
                yield {
                  type: "agent_response",
                  agentId: agent.id,
                  agentName: agent.name,
                  content: result.content,
                  usage: {
                    ...result.usage,
                    cost: finalCost,
                  },
                  status: "completed",
                  timestamp: new Date().toISOString(),
                };

                logger.info("Agent processing completed", {
                  agentId: agent.id,
                  agentName: agent.name,
                  baseCost,
                  finalCost,
                  tokens: result.usage.inputTokens + result.usage.outputTokens,
                });

                results.push(result);
              } else {
                logger.error("Agent processing failed", {
                  agentId: agent.id,
                  agentName: agent.name,
                  error: result.error,
                });

                yield {
                  type: "agent_error",
                  agentId: agent.id,
                  agentName: agent.name,
                  error: result.error || "Unknown error",
                  status: "failed",
                  timestamp: new Date().toISOString(),
                };

                results.push(result);
              }
            } catch (error) {
              logger.error("Error processing agent", {
                agentId: agent.id,
                agentName: agent.name,
                error: error instanceof Error ? error.message : String(error),
              });

              results.push({
                agentId: agent.id,
                agentName: agent.name,
                content: "",
                uiMessageParts: [],
                usage: {
                  inputTokens: 0,
                  outputTokens: 0,
                  model: agent.model,
                  cost: 0,
                },
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });

              yield {
                type: "agent_error",
                agentId: agent.id,
                agentName: agent.name,
                error: error instanceof Error ? error.message : String(error),
                status: "failed",
                timestamp: new Date().toISOString(),
              };
            }
          }

          // Send completion update
          yield {
            type: "processing_complete",
            totalCost,
            processedAgents: results.length,
            successfulAgents: results.filter((r) => r.success).length,
            classification: {
              interactionType: classification.interactionType,
              agentCount: agentsToRespond.length,
              confidence: classification.confidence,
            },
            status: "completed",
            timestamp: new Date().toISOString(),
          };

          logger.info("Chat processing completed", {
            chatId,
            totalCost,
            processedAgents: results.length,
            successfulAgents: results.filter((r) => r.success).length,
          });

          return {
            success: true,
            results,
            totalCost,
            processedAgents: results.length,
            successfulAgents: results.filter((r) => r.success).length,
          };
        } catch (error) {
          logger.error("Chat processing failed", {
            chatId,
            error: error instanceof Error ? error.message : String(error),
          });

          yield {
            type: "processing_error",
            error: error instanceof Error ? error.message : String(error),
            status: "failed",
            timestamp: new Date().toISOString(),
          };

          throw error;
        }
      })(),
    );
  },
});

/**
 * Process a single agent's response with streaming support
 */
async function* processAgentResponseWithStreaming(
  agent: Agent,
  messageHistory: any[],
  chatInstructions: string,
  chatStyle: string = "brainstorm",
  classification?: PromptClassification,
): AsyncGenerator<any, void, unknown> {
  try {
    const systemPrompt = buildSystemPrompt(
      agent,
      {
        style: chatStyle as "brainstorm" | "debate" | "analyze" | "custom",
        instructions: chatInstructions,
      },
      messageHistory,
      classification,
    );

    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...messageHistory,
    ];

    const model = getModelProvider(agent.model);

    const uiMessageParts: any[] = [];
    let fullContent = "";
    let finalUsage: LanguageModelUsage | undefined = undefined;
    let finalCost = 0;

    const result = streamText({
      model,
      messages,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens || 2000,
      onFinish: async (event) => {
        finalUsage = event.usage;

        logger.info("Agent stream onFinish callback triggered", {
          agentId: agent.id,
          agentName: agent.name,
          usageObject: event.usage,
          usageKeys: Object.keys(event.usage || {}),
        });

        const inputTokens = event.usage.inputTokens || 0;
        const outputTokens = event.usage.outputTokens || 0;

        finalCost = calculateCostFromUsage(
          agent.model,
          inputTokens,
          outputTokens,
        );

        logger.info("Agent stream finished with calculated base cost", {
          agentId: agent.id,
          agentName: agent.name,
          inputTokens,
          outputTokens,
          baseCost: finalCost,
        });
      },
    });

    for await (const messagePart of result.toUIMessageStream()) {
      uiMessageParts.push(messagePart);

      if (messagePart.type === "text-delta") {
        fullContent += messagePart.delta;
      }

      yield {
        type: "ui_message_part",
        messagePart: messagePart,
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
      };
    }

    await result.usage;

    const trimmedContent = fullContent.trim();
    const hasContent = trimmedContent.length > 0;

    logger.info("Creating final result after stream completion", {
      agentId: agent.id,
      agentName: agent.name,
      finalUsage,
      finalUsageKeys: Object.keys(finalUsage || {}),
      baseCost: finalCost,
      fullContentLength: fullContent.length,
      trimmedContentLength: trimmedContent.length,
      hasContent,
      uiMessagePartsCount: uiMessageParts.length,
    });

    const inputTokens =
      (finalUsage as LanguageModelUsage | undefined)?.inputTokens || 0;
    const outputTokens =
      (finalUsage as LanguageModelUsage | undefined)?.outputTokens || 0;

    if (!hasContent) {
      logger.warn("Agent produced no content during streaming", {
        agentId: agent.id,
        agentName: agent.name,
        inputTokens,
        outputTokens,
        originalCost: finalCost,
      });

      yield {
        type: "result",
        data: {
          agentId: agent.id,
          agentName: agent.name,
          content: "",
          uiMessageParts: [],
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            model: agent.model,
            cost: 0,
          },
          success: true,
        } as AgentProcessingResult,
      };
      return;
    }

    yield {
      type: "result",
      data: {
        agentId: agent.id,
        agentName: agent.name,
        content: trimmedContent,
        uiMessageParts,
        usage: {
          inputTokens,
          outputTokens,
          model: agent.model,
          cost: finalCost,
        },
        success: true,
      } as AgentProcessingResult,
    };
  } catch (error) {
    logger.error("Error in agent processing", {
      agentId: agent.id,
      agentName: agent.name,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    yield {
      type: "result",
      data: {
        agentId: agent.id,
        agentName: agent.name,
        content: "",
        uiMessageParts: [],
        usage: { inputTokens: 0, outputTokens: 0, model: agent.model, cost: 0 },
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } as AgentProcessingResult,
    };
  }
}

/**
 * Get model provider based on model name
 */
function getModelProvider(modelName: string) {
  if (modelName.startsWith("gpt-")) {
    return openai(modelName);
  } else if (modelName.startsWith("claude-")) {
    return anthropic(modelName);
  } else if (modelName.startsWith("gemini-")) {
    return google(modelName);
  } else if (modelName.startsWith("deepseek-")) {
    return deepseek(modelName);
  } else {
    return openai("gpt-4");
  }
}

export type STREAMS = {
  "chat-updates": StreamUpdate;
};
