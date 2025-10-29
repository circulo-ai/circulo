import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { deepseek } from "@ai-sdk/deepseek";
import { streamText } from "ai";
import { task, logger, metadata } from "@trigger.dev/sdk";
import { ChatService, type UsageMetrics } from "@/services/chat-service";
import { calculateCostFromUsage } from "@/lib/server-utils";
import type { ModelMessage, UIMessage } from "ai";

interface ProcessChatPayload {
  chatId: string;
  messageId: string;
  userId: string;
}

interface AgentProcessingResult {
  agentId: string;
  content: string;
  uiMessageParts: any[];
  usage: UsageMetrics;
  success: boolean;
  error?: string;
}

interface StreamUpdate {
  type: "agent_processing" | "agent_response" | "agent_error" | "processing_complete" | "processing_error" | "ui_message_part";
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
      try {
        // Get chat with all related data
        const chat = await ChatService.getChatById(chatId, userId);
        if (!chat) {
          throw new Error(`Chat ${chatId} not found or access denied`);
        }

        // Check if user has sufficient balance
        const estimatedCost = chat.agents.length * 0.02; // Rough estimate
        const hasBalance = await ChatService.checkUserBalance(userId, estimatedCost);
        if (!hasBalance) {
          throw new Error("Insufficient balance for chat processing");
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
        
        // Process each agent sequentially
        const results: AgentProcessingResult[] = [];
        let totalCost = 0;

        for (const agent of enabledAgents) {
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
              chat.instructions || ""
            );

            let result: AgentProcessingResult | null = null;
            for await (const update of agentResponseGenerator) {
              if (update.type === 'result') {
                result = update.data;
              } else {
                yield update;
              }
            }

            if (!result) {
              throw new Error("No result received from agent processing");
            }

            if (result.success) {
              // Add agent message to database using UI message parts
              await ChatService.addAgentMessageFromParts(
                chatId,
                agent.id,
                result.uiMessageParts,
                result.usage
              );

              // Process usage and create transaction
              await ChatService.processUsage(userId, chatId, result.usage);

              // Add to message history for next agents
              messageHistory.push({
                role: "assistant",
                content: result.content,
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
                 cost: result.usage.cost,
                 tokens: result.usage.inputTokens + result.usage.outputTokens
               });
             } else {
               logger.error("Agent processing failed", {
                 agentId: agent.id,
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
             logger.error("Error processing agent", { 
               agentId: agent.id, 
               error: error instanceof Error ? error.message : String(error)
             });

             results.push({
               agentId: agent.id,
               content: "",
               uiMessageParts: [],
               usage: { inputTokens: 0, outputTokens: 0, model: agent.model, cost: 0 },
               success: false,
               error: error instanceof Error ? error.message : String(error)
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
  chatInstructions: string
): AsyncGenerator<any, void, unknown> {
  try {
    // Build system prompt
    const systemPrompt = buildSystemPrompt(agent, chatInstructions);
    
    // Prepare messages
    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...messageHistory
    ];

    // Get the appropriate model provider
    const model = getModelProvider(agent.model);
    
    // Stream the response
    const result = streamText({
      model,
      messages,
      temperature: parseFloat(agent.temperature) || 0.7,
      maxOutputTokens: agent.maxTokens || 2000,
    });



    // Collect UI message parts and track full content
    const uiMessageParts: any[] = [];
    let fullContent = "";
    
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

    // Get usage information - in AI SDK v5, usage is available directly
    const usage = await result.usage;
    
    const cost = calculateCostFromUsage(
      agent.model,
      usage.inputTokens || 0,
      usage.outputTokens || 0
    );

    // Yield the final result with UI message parts
    yield {
      type: 'result',
      data: {
        agentId: agent.id,
        content: fullContent,
        uiMessageParts, // Include the collected parts
        usage: {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          model: agent.model,
          cost
        },
        success: true
      } as AgentProcessingResult
    };

  } catch (error) {
    logger.error("Error in agent processing", {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error)
    });

    // Yield error result
    yield {
      type: 'result',
      data: {
        agentId: agent.id,
        content: "",
        uiMessageParts: [],
        usage: { inputTokens: 0, outputTokens: 0, model: agent.model, cost: 0 },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      } as AgentProcessingResult
    };
  }
}

/**
 * Build message history from chat messages
 */
function buildMessageHistory(messages: any[]): ModelMessage[] {
  return messages.map(msg => ({
    role: msg.userId ? "user" : "assistant",
    content: msg.content
  }));
}

/**
 * Build system prompt for agent
 */
function buildSystemPrompt(agent: any, chatInstructions: string): string {
  let prompt = agent.systemPrompt || "You are a helpful AI assistant.";
  
  if (chatInstructions) {
    prompt += `\n\nChat Instructions: ${chatInstructions}`;
  }
  
  prompt += `\n\nYou are participating in a multi-agent conversation. Provide thoughtful, relevant responses that build on the previous messages.`;
  
  return prompt;
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