import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { deepseek } from "@ai-sdk/deepseek";
import { streamText } from "ai";
import { task, logger, metadata } from "@trigger.dev/sdk";
import { ChatService, type UsageMetrics } from "@/services/chat-service";
import { calculateCostFromUsage, generateId } from "@/lib/server-utils";
import { acquireLock, releaseLock } from "@/lib/redis";
import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai";

interface ProcessChatPayload {
  chatId: string;
  messageId: string;
  userId: string;
}

interface AgentProcessingResult {
  agentId: string;
  agentName: string;
  content: string;
  uiMessageParts: any[];
  usage: UsageMetrics;
  success: boolean;
  error?: string;
  reservationId?: string;
}

interface StreamUpdate {
  type: "agent_processing" | "agent_response" | "agent_error" | "processing_complete" | "processing_error" | "ui_message_part" | "balance_reserved" | "balance_released";
  timestamp: string;
  agentId?: string;
  agentName?: string;
  content?: string;
  fullContent?: string;
  messagePart?: UIMessage;
  usage?: UsageMetrics;
  status?: "starting" | "completed" | "failed";
  error?: string;
  totalCost?: number;
  processedAgents?: number;
  successfulAgents?: number;
  reservedAmount?: number;
  reservationId?: string;
}

interface WalletReservation {
  id: string;
  userId: string;
  amount: number;
  chatId: string;
  agentId: string;
  createdAt: Date;
}

// In-memory store for wallet reservations (in production, use Redis)
const walletReservations = new Map<string, WalletReservation>();

/**
 * Reserve wallet balance for agent processing to prevent race conditions
 */
async function reserveWalletBalance(
  userId: string,
  chatId: string,
  agentId: string,
  estimatedCost: number
): Promise<string> {
  const lockKey = `wallet:${userId}`;
  const lockValue = generateId();
  const lockAcquired = await acquireLock(lockKey, lockValue, 30);

  if (!lockAcquired) {
    throw new Error("Could not acquire wallet lock for reservation");
  }

  try {
    // Check current balance
    const hasBalance = await ChatService.checkUserBalance(userId, estimatedCost);
    if (!hasBalance) {
      throw new Error("Insufficient balance for reservation");
    }

    // Create reservation
    const reservationId = generateId();
    const reservation: WalletReservation = {
      id: reservationId,
      userId,
      amount: estimatedCost,
      chatId,
      agentId,
      createdAt: new Date(),
    };

    walletReservations.set(reservationId, reservation);

    logger.info("Wallet balance reserved", {
      reservationId,
      userId,
      agentId,
      amount: estimatedCost,
    });

    return reservationId;
  } finally {
    await releaseLock(lockKey);
  }
}

/**
 * Release wallet reservation
 */
async function releaseWalletReservation(reservationId: string): Promise<void> {
  const reservation = walletReservations.get(reservationId);
  if (reservation) {
    walletReservations.delete(reservationId);
    logger.info("Wallet reservation released", { reservationId });
  }
}

/**
 * Calculate better cost estimation based on model and expected usage
 */
function calculateEstimatedCost(model: string, messageHistory: ModelMessage[]): number {
  // Estimate input tokens (rough calculation)
  const inputTokens = messageHistory.reduce((acc, msg) => {
    return acc + Math.ceil(msg.content.length / 4); // Rough token estimation
  }, 0);

  // Estimate output tokens (conservative estimate)
  const outputTokens = 500; // Conservative estimate for agent response

  return calculateCostFromUsage(model, inputTokens, outputTokens);
}

/**
 * Main task for processing chat messages with sequential agent responses
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
      runId: ctx.run.id 
    });

    // Create a single stream for all updates
    return await metadata.stream("chat-updates", async function* () {
      const reservations: string[] = [];
      
      try {
        // Get chat with all related data
        const chat = await ChatService.getChatById(chatId, userId);
        if (!chat) {
          throw new Error(`Chat ${chatId} not found or access denied`);
        }

        logger.info("Processing chat with agents", {
          chatId,
          agentCount: chat.agents.length,
          enabledAgents: chat.agents.filter(a => a.enabled).length
        });

        // Get enabled agents sorted by speak order
        const enabledAgents = chat.agents
          .filter(agent => agent.enabled)
          .sort((a, b) => a.speakOrder - b.speakOrder);

        if (enabledAgents.length === 0) {
          logger.warn("No enabled agents found for chat", { chatId });
          yield {
            type: "processing_error",
            error: "No enabled agents found",
            status: "failed",
            timestamp: new Date().toISOString()
          };
          return { success: false, error: "No enabled agents found" };
        }

        // Build message history for context
        const messageHistory = buildMessageHistory(chat.messages);
        
        // Pre-reserve balance for all agents to prevent race conditions
        for (const agent of enabledAgents) {
          const estimatedCost = calculateEstimatedCost(agent.model, messageHistory);
          
          try {
            const reservationId = await reserveWalletBalance(
              userId,
              chatId,
              agent.id,
              estimatedCost
            );
            
            reservations.push(reservationId);
            
            yield {
              type: "balance_reserved",
              agentId: agent.id,
              agentName: agent.name,
              reservedAmount: estimatedCost,
              reservationId,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            // Release any existing reservations
            for (const resId of reservations) {
              await releaseWalletReservation(resId);
            }
            
            throw new Error(`Failed to reserve balance for agent ${agent.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        // Process each agent sequentially
        const results: AgentProcessingResult[] = [];
        let totalCost = 0;

        for (let i = 0; i < enabledAgents.length; i++) {
          const agent = enabledAgents[i];
          const reservationId = reservations[i];
          
          try {
            logger.info("Processing agent", { 
              agentId: agent.id, 
              agentName: agent.name,
              speakOrder: agent.speakOrder 
            });

            // Send streaming update
            yield {
              type: "agent_processing",
              agentId: agent.id,
              agentName: agent.name,
              status: "starting",
              timestamp: new Date().toISOString()
            };

            // Process agent response with streaming
            const agentResponseGenerator = processAgentResponseWithStreaming(
              agent,
              messageHistory,
              chat.instructions || "",
              reservationId
            );

            let result: AgentProcessingResult | null = null;
            for await (const update of agentResponseGenerator) {
              if (update.type === 'result') {
                result = update.data;
                if (result) {
                  logger.info("Received result from agent generator", {
                    agentId: agent.id,
                    agentName: agent.name,
                    resultSuccess: result.success,
                    contentLength: result.content.length,
                    hasUsage: !!result.usage,
                    usage: result.usage
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
              // Save the agent message to the database
              logger.info("Attempting to save agent message to database", {
                agentId: agent.id,
                agentName: agent.name,
                chatId,
                contentLength: result.content.length,
                hasUsage: !!result.usage,
                hasUiMessageParts: !!result.uiMessageParts,
                uiMessagePartsCount: result.uiMessageParts?.length || 0,
                usage: result.usage
              });
              
              try {
                const savedMessage = await ChatService.addAgentMessage(
                  chatId,
                  agent.id,
                  result.content,
                  result.usage,
                  undefined, // toolCalls - not used in this context
                  result.uiMessageParts // Pass the collected UI message parts
                );
                
                logger.info("Agent message successfully saved to database", {
                  agentId: agent.id,
                  agentName: agent.name,
                  messageId: savedMessage.id,
                  messageLength: result.content.length,
                  tokenCount: result.usage.inputTokens + result.usage.outputTokens,
                  cost: result.usage.cost,
                  savedAt: new Date().toISOString()
                });
              } catch (messageError) {
                logger.error("Failed to save agent message to database", {
                  agentId: agent.id,
                  agentName: agent.name,
                  chatId,
                  error: messageError instanceof Error ? messageError.message : String(messageError),
                  stack: messageError instanceof Error ? messageError.stack : undefined,
                  contentPreview: result.content.substring(0, 100),
                  usage: result.usage
                });
                // Don't fail the entire process for message save errors, but log it
                throw messageError; // Re-throw to see if this is causing silent failures
              }

              // Process usage and create transaction (this will handle the actual deduction)
              await ChatService.processUsage(userId, chatId, result.usage);

              // Release the reservation since we've processed the actual cost
              await releaseWalletReservation(reservationId);
              
              yield {
                type: "balance_released",
                agentId: agent.id,
                agentName: agent.name,
                reservationId,
                timestamp: new Date().toISOString()
              };

              // Add to message history for next agents with agent name context
              messageHistory.push({
                role: "assistant",
                content: `[${agent.name}]: ${result.content}`,
              });

              totalCost += result.usage.cost;

              // Send completion update
              yield {
                type: "agent_response",
                agentId: agent.id,
                agentName: agent.name,
                content: result.content,
                usage: result.usage,
                status: "completed",
                timestamp: new Date().toISOString()
              };

               logger.info("Agent processing completed", {
                 agentId: agent.id,
                 agentName: agent.name,
                 cost: result.usage.cost,
                 tokens: result.usage.inputTokens + result.usage.outputTokens
               });
             } else {
               // Release reservation on failure
               await releaseWalletReservation(reservationId);
               
               logger.error("Agent processing failed", {
                 agentId: agent.id,
                 agentName: agent.name,
                 error: result.error
               });

               yield {
                 type: "agent_error",
                 agentId: agent.id,
                 agentName: agent.name,
                 error: result.error || "Unknown error",
                 status: "failed",
                 timestamp: new Date().toISOString()
               };
             }

             results.push(result);
           } catch (error) {
             // Release reservation on error
             await releaseWalletReservation(reservationId);
             
             logger.error("Error processing agent", { 
               agentId: agent.id,
               agentName: agent.name,
               error: error instanceof Error ? error.message : String(error)
             });

             results.push({
               agentId: agent.id,
               agentName: agent.name,
               content: "",
               uiMessageParts: [],
               usage: { inputTokens: 0, outputTokens: 0, model: agent.model, cost: 0 },
               success: false,
               error: error instanceof Error ? error.message : String(error),
               reservationId
             });

             yield {
               type: "agent_error",
               agentId: agent.id,
               agentName: agent.name,
               error: error instanceof Error ? error.message : String(error),
               status: "failed",
               timestamp: new Date().toISOString()
             };
           }
         }

         // Send completion update
         yield {
           type: "processing_complete",
           totalCost,
           processedAgents: results.length,
           successfulAgents: results.filter(r => r.success).length,
           status: "completed",
           timestamp: new Date().toISOString()
         };

         logger.info("Chat processing completed", {
           chatId,
           totalCost,
           processedAgents: results.length,
           successfulAgents: results.filter(r => r.success).length
         });

         return {
           success: true,
           results,
           totalCost,
           processedAgents: results.length,
           successfulAgents: results.filter(r => r.success).length
         };

       } catch (error) {
         // Release any remaining reservations on error
         for (const reservationId of reservations) {
           await releaseWalletReservation(reservationId);
         }
         
         logger.error("Chat processing failed", { 
           chatId, 
           error: error instanceof Error ? error.message : String(error)
         });

         // Send error update
         yield {
           type: "processing_error",
           error: error instanceof Error ? error.message : String(error),
           status: "failed",
           timestamp: new Date().toISOString()
         };

         throw error;
        }
      }());
  },
});

/**
 * Process a single agent's response with streaming support
 */
async function* processAgentResponseWithStreaming(
  agent: any,
  messageHistory: any[],
  chatInstructions: string,
  reservationId?: string
): AsyncGenerator<any, void, unknown> {
  try {
    // Build enhanced system prompt with agent context and conversation awareness
    const systemPrompt = buildSystemPrompt(agent, chatInstructions, messageHistory);
    
    // Prepare messages
    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...messageHistory
    ];

    // Get the appropriate model provider
    const model = getModelProvider(agent.model);
    
    // Collect UI message parts and track full content
    const uiMessageParts: any[] = [];
    let fullContent = "";
    let finalUsage: LanguageModelUsage | undefined = undefined;
    let finalCost = 0;
    
    // Stream the response with proper onFinish callback
    const result = streamText({
      model,
      messages,
      temperature: parseFloat(agent.temperature) || 0.7,
      maxOutputTokens: agent.maxTokens || 2000,
      onFinish: async (event) => {
        // Calculate cost after stream completion
        finalUsage = event.usage;
        
        // Debug: Log the complete usage object structure
        logger.info("Agent stream onFinish callback triggered", {
          agentId: agent.id,
          agentName: agent.name,
          usageObject: event.usage,
          usageKeys: Object.keys(event.usage || {}),
          reservationId
        });
        
        // Use the correct property names based on what's actually available
        const inputTokens = event.usage.inputTokens || 0;
        const outputTokens = event.usage.outputTokens || 0;
        
        finalCost = calculateCostFromUsage(agent.model, inputTokens, outputTokens);
        
        logger.info("Agent stream finished with calculated cost", {
          agentId: agent.id,
          agentName: agent.name,
          inputTokens,
          outputTokens,
          cost: finalCost,
          reservationId
        });
      }
    });
    
    for await (const messagePart of result.toUIMessageStream()) {
      // Collect all parts for database storage
      uiMessageParts.push(messagePart);
      
      // Track full content for legacy compatibility
      if (messagePart.type === 'text-delta') {
        fullContent += messagePart.delta;
      }
      
      // Send the UI message part directly as-is
      yield {
        type: "ui_message_part",
        messagePart: messagePart,
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date().toISOString()
      };
    }

    // Wait for the onFinish callback to complete
    await result.usage;

    // Debug: Log the final usage object before creating result
    logger.info("Creating final result after stream completion", {
      agentId: agent.id,
      agentName: agent.name,
      finalUsage,
      finalUsageKeys: Object.keys(finalUsage || {}),
      finalCost,
      fullContentLength: fullContent.length,
      uiMessagePartsCount: uiMessageParts.length,
      reservationId
    });

    // Use the correct property names for the final result
    const inputTokens = (finalUsage as LanguageModelUsage | undefined)?.inputTokens || 0;
    const outputTokens = (finalUsage as LanguageModelUsage | undefined)?.outputTokens || 0;

    // Yield the final result with UI message parts
    yield {
      type: 'result',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        content: fullContent,
        uiMessageParts, // Include the collected parts
        usage: {
          inputTokens,
          outputTokens,
          model: agent.model,
          cost: finalCost
        },
        success: true,
        reservationId
      } as AgentProcessingResult
    };

  } catch (error) {
    logger.error("Error in agent processing", {
      agentId: agent.id,
      agentName: agent.name,
      error: error instanceof Error ? error.message : String(error),
      reservationId
    });

    // Yield error result
    yield {
      type: 'result',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        content: "",
        uiMessageParts: [],
        usage: { inputTokens: 0, outputTokens: 0, model: agent.model, cost: 0 },
        success: false,
        error: error instanceof Error ? error.message : String(error),
        reservationId
      } as AgentProcessingResult
    };
  }
}

/**
 * Build enhanced message history for model context with agent awareness
 */
function buildMessageHistory(messages: any[]): ModelMessage[] {
  return messages
    .filter(msg => msg.content && msg.content.trim()) // Filter out empty messages
    .map(msg => {
      let content = msg.content;
      
      // Ensure content is a string
      if (typeof content !== "string") {
        content = JSON.stringify(content);
      }
      
      // For assistant messages, include agent name if available and not already present
      if (!msg.userId && msg.agentName && !content.startsWith("[")) {
        content = `[${msg.agentName}]: ${content}`;
      }
      
      return {
        role: msg.userId ? "user" as const : "assistant" as const,
        content: content
      };
    })
    .slice(-20); // Keep last 20 messages to manage context window
}

/**
 * Build enhanced system prompt for agent with context awareness
 */
function buildSystemPrompt(agent: any, chatInstructions: string, messageHistory?: ModelMessage[]): string {
  let systemPrompt = "";
  
  // Start with agent identity and role
  systemPrompt += `You are ${agent.name}`;
  if (agent.description) {
    systemPrompt += `, ${agent.description}`;
  }
  systemPrompt += ".\n\n";
  
  // Add agent's specific system prompt if available
  if (agent.systemPrompt) {
    systemPrompt += `${agent.systemPrompt}\n\n`;
  }
  
  // Add context about the roundtable discussion
  systemPrompt += "CONTEXT:\n";
  systemPrompt += "You are participating in a collaborative roundtable discussion with other AI agents. ";
  systemPrompt += "Each agent brings their unique perspective and expertise to help provide the best possible response to the user.\n\n";
  
  // Add information about conversation flow
  if (messageHistory && messageHistory.length > 0) {
    const previousAgents = messageHistory
      .filter(msg => msg.role === "assistant" && typeof msg.content === "string" && msg.content.includes("["))
      .map(msg => {
        const content = msg.content as string;
        const match = content.match(/^\[([^\]]+)\]:/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    
    if (previousAgents.length > 0) {
      systemPrompt += `PREVIOUS SPEAKERS:\n`;
      systemPrompt += `The following agents have already contributed to this conversation: ${previousAgents.join(", ")}.\n`;
      systemPrompt += `Please build upon their insights while adding your unique perspective.\n\n`;
    }
  }
  
  // Add chat-specific instructions if available
  if (chatInstructions) {
    systemPrompt += `CHAT INSTRUCTIONS:\n${chatInstructions}\n\n`;
  }
  
  // Add behavioral guidelines
  systemPrompt += "GUIDELINES:\n";
  systemPrompt += "- Provide thoughtful, relevant responses that complement other agents' contributions\n";
  systemPrompt += "- Avoid repeating information already covered by previous agents\n";
  systemPrompt += "- Focus on your area of expertise while remaining collaborative\n";
  systemPrompt += "- Keep responses concise but comprehensive\n";
  systemPrompt += "- If you disagree with a previous agent, explain your reasoning respectfully\n\n";
  
  // Add model-specific optimizations
  if (agent.model.includes("gpt")) {
    systemPrompt += "Respond in a clear, structured manner that maximizes value for the user.\n";
  } else if (agent.model.includes("claude")) {
    systemPrompt += "Provide thoughtful analysis with careful reasoning and attention to nuance.\n";
  } else if (agent.model.includes("gemini")) {
    systemPrompt += "Offer creative insights and comprehensive perspectives on the topic.\n";
  }
  
  return systemPrompt.trim();
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
    // Default to OpenAI
    return openai("gpt-4");
  }
}

// Export stream types for frontend use
export type STREAMS = {
  "chat-updates": StreamUpdate;
};