import { ChatWithRelations, db, Wallet } from "@/db";
import {
  agent,
  auditLog,
  chat,
  chatAgent,
  chatKnowledgeBase,
  knowledgeBase,
  message,
  transaction,
  user,
  wallet,
  type Chat,
  type Message,
  type Transaction,
} from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { acquireLock, releaseLock } from "@/lib/redis";
import { generateId } from "@/lib/server-utils";
import type { FileUIPart, UIMessage } from "ai";
import { desc, eq, sql } from "drizzle-orm";

const logger = createLogger("ChatService");

export interface CreateChatParams {
  userId: string;
  title: string;
  description?: string;
  style?: "brainstorm" | "debate" | "analyze" | "custom";
  visibility?: "public" | "private";
  instructions?: string;
  agentIds?: string[];
  knowledgeBaseIds?: string[];
}

export interface SendMessageParams {
  chatId: string;
  userId: string;
  content: string;
  files?: FileUIPart[];
  quotedMessageId?: string;
}

export interface ProcessChatParams {
  chatId: string;
  messageId: string;
  userId: string;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  model: string;
  cost: number;
}

export class ChatService {
  /**
   * Create a new chat with agents and knowledge bases
   */
  static async createChat(params: CreateChatParams): Promise<Chat> {
    const {
      userId,
      title,
      description,
      style = "brainstorm",
      visibility = "private",
      instructions,
      agentIds = [],
      knowledgeBaseIds = [],
    } = params;

    return await db.transaction(async (tx) => {
      // Create the chat
      const chatId = generateId();
      const [newChat] = await tx
        .insert(chat)
        .values({
          id: chatId,
          userId,
          title,
          description,
          style,
          visibility,
          instructions,
        })
        .returning();

      // Add agents to chat
      if (agentIds.length > 0) {
        const chatAgentData = agentIds.map((agentId, index) => ({
          id: generateId(),
          chatId,
          agentId,
          speakOrder: index + 1,
          enabled: true,
        }));

        await tx.insert(chatAgent).values(chatAgentData);
      }

      // Add knowledge bases to chat
      if (knowledgeBaseIds.length > 0) {
        const chatKbData = knowledgeBaseIds.map((knowledgeBaseId) => ({
          id: generateId(),
          chatId,
          knowledgeBaseId,
          enabled: true,
        }));

        await tx.insert(chatKnowledgeBase).values(chatKbData);
      }

      // Create audit log
      await tx.insert(auditLog).values({
        userId,
        action: "chat.create",
        entityType: "chat",
        entityId: chatId,
        details: { title, style, agentCount: agentIds.length },
      });

      logger.info(`Created chat ${chatId} for user ${userId}`);
      return newChat;
    });
  }

  /**
   * Get chat by ID with all related data
   */
  static async getChatById(
    chatId: string,
    userId?: string,
  ): Promise<ChatWithRelations | null> {
    try {
      // 1. Get chat with user info
      const chatData = await db
        .select({
          chat: chat,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        })
        .from(chat)
        .innerJoin(user, eq(chat.userId, user.id))
        .where(eq(chat.id, chatId))
        .limit(1);

      if (!chatData.length) {
        return null;
      }

      const chatInfo = chatData[0];

      // Check access permissions
      if (
        userId &&
        chatInfo.chat.visibility === "private" &&
        chatInfo.chat.userId !== userId
      ) {
        throw new Error("Access denied to private chat");
      }

      // 2. Get agents (No change needed)
      const agentsData = await db
        .select({
          agent: agent,
          speakOrder: chatAgent.speakOrder,
          enabled: chatAgent.enabled,
        })
        .from(chatAgent)
        .innerJoin(agent, eq(chatAgent.agentId, agent.id))
        .where(eq(chatAgent.chatId, chatId))
        .orderBy(chatAgent.speakOrder);

      // 3. Get knowledge bases (No change needed)
      const knowledgeBasesData = await db
        .select({
          id: knowledgeBase.id,
          name: knowledgeBase.name,
          enabled: chatKnowledgeBase.enabled,
        })
        .from(chatKnowledgeBase)
        .innerJoin(
          knowledgeBase,
          eq(chatKnowledgeBase.knowledgeBaseId, knowledgeBase.id),
        )
        .where(eq(chatKnowledgeBase.chatId, chatId));

      // 4. Get messages and LEFT JOIN with agent
      // We use a LEFT JOIN because agentId is optional (messages can be from the user)
      const messagesData = await db
        .select({
          message: message,
          agent: agent, // Select all agent fields
        })
        .from(message)
        .leftJoin(agent, eq(message.agentId, agent.id)) // LEFT JOIN on agentId
        .where(eq(message.chatId, chatId))
        .orderBy(message.createdAt);

      return {
        ...chatInfo.chat,
        user: chatInfo.user,
        agents: agentsData.map((item) => ({
          ...item.agent,
          speakOrder: item.speakOrder,
          enabled: item.enabled,
        })),
        knowledgeBases: knowledgeBasesData,
        // FIXED: Map the joined result into the desired MessageWithAgent format
        messages: messagesData.map((item) => ({
          ...item.message,
          agent: item.agent, // Drizzle correctly maps null when it's a LEFT JOIN and no match is found
        })),
      } as ChatWithRelations; // Cast to ensure correct final type
    } catch (error) {
      // You'll need to make sure 'logger' is defined in this scope
      // logger.error(`Failed to get chat ${chatId}:`, { error });
      throw error;
    }
  }

  /**
   * Get user's wallet
   */
  static async getUserWallet(userId: string): Promise<Wallet> {
    try {
      const [userWallet] = await db
        .select()
        .from(wallet)
        .where(eq(wallet.userId, userId))
        .limit(1);

      if (!userWallet) {
        throw new Error("User wallet not found");
      }

      return userWallet;
    } catch (error) {
      logger.error(`Failed to get wallet for user ${userId}:`, { error });
      throw error;
    }
  }

  /**
   * Send a message to a chat
   */
  static async sendMessage(params: SendMessageParams): Promise<Message> {
    const { chatId, userId, content, files = [], quotedMessageId } = params;

    // Validate chat access
    const chatData = await this.getChatById(chatId, userId);
    if (!chatData) {
      throw new Error("Chat not found or access denied");
    }

    return await db.transaction(async (tx) => {
      const messageId = generateId();

      // Create UI message for streaming
      const uiMessage: UIMessage = {
        id: messageId,
        role: "user",
        parts: [{ type: "text", text: content }, ...(files || [])],
      };

      // Insert message
      const [newMessage] = await tx
        .insert(message)
        .values({
          id: messageId,
          chatId,
          userId,
          content,
          uiMessage,
          quotedMessageId,
          tokenCount: Math.ceil(content.length / 4), // Rough token estimate
        })
        .returning();

      // Update chat message count
      await tx
        .update(chat)
        .set({
          messageCount: sql`${chat.messageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(chat.id, chatId));

      // Create audit log
      await tx.insert(auditLog).values({
        userId,
        action: "message.send",
        entityType: "message",
        entityId: messageId,
        details: { chatId, contentLength: content.length },
      });

      logger.info(`User ${userId} sent message ${messageId} to chat ${chatId}`);
      return newMessage;
    });
  }

  /**
   * Check if user has sufficient balance for chat processing
   */
  static async checkUserBalance(
    userId: string,
    estimatedCost: number,
  ): Promise<boolean> {
    try {
      const userWallet = await db
        .select()
        .from(wallet)
        .where(eq(wallet.userId, userId))
        .limit(1);

      if (!userWallet.length) {
        return false;
      }

      const balance = parseFloat(userWallet[0].balance);
      return balance >= estimatedCost;
    } catch (error) {
      logger.error(`Failed to check balance for user ${userId}:`, { error });
      return false;
    }
  }

  /**
   * Process usage and create transaction
   */
  static async processUsage(
    userId: string,
    chatId: string,
    usage: UsageMetrics,
  ): Promise<Transaction> {
    const lockKey = `wallet:${userId}`;
    const lockValue = generateId();
    const lockAcquired = await acquireLock(lockKey, lockValue, 30);

    if (!lockAcquired) {
      throw new Error("Could not acquire wallet lock");
    }

    try {
      return await db.transaction(async (tx) => {
        // Get current wallet balance
        const [userWallet] = await tx
          .select()
          .from(wallet)
          .where(eq(wallet.userId, userId))
          .limit(1);

        if (!userWallet) {
          throw new Error("User wallet not found");
        }

        const currentBalance = parseFloat(userWallet.balance);
        const cost = usage.cost;

        if (currentBalance < cost) {
          throw new Error("Insufficient balance");
        }

        const newBalance = currentBalance - cost;

        // Update wallet balance
        await tx
          .update(wallet)
          .set({
            balance: newBalance.toFixed(4),
            updatedAt: new Date(),
          })
          .where(eq(wallet.id, userWallet.id));

        // Create transaction record
        const transactionId = generateId();
        const [newTransaction] = await tx
          .insert(transaction)
          .values({
            id: transactionId,
            userId,
            walletId: userWallet.id,
            type: "chat_usage",
            status: "completed",
            amount: cost.toFixed(4),
            balanceBefore: currentBalance.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            chatId,
            description: `Chat processing - ${usage.model}`,
            metadata: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              model: usage.model,
            },
          })
          .returning();

        // Update chat totals
        await tx
          .update(chat)
          .set({
            totalTokens: sql`${chat.totalTokens} + ${usage.inputTokens + usage.outputTokens}`,
            totalCost: sql`${chat.totalCost} + ${cost}`,
            updatedAt: new Date(),
          })
          .where(eq(chat.id, chatId));

        // Create audit log
        await tx.insert(auditLog).values({
          userId,
          action: "transaction.create",
          entityType: "transaction",
          entityId: transactionId,
          details: {
            type: "chat_usage",
            amount: cost,
            chatId,
            model: usage.model,
          },
        });

        logger.info(
          `Processed usage for user ${userId}: $${cost} (${usage.inputTokens}+${usage.outputTokens} tokens)`,
        );

        return newTransaction;
      });
    } finally {
      await releaseLock(lockKey);
    }
  }

  /**
   * Add agent response message from UI message parts (for streaming)
   */
  static async addAgentMessageFromParts(
    chatId: string,
    agentId: string,
    uiMessageParts: any[],
    usage?: UsageMetrics,
  ): Promise<Message> {
    return await db.transaction(async (tx) => {
      const messageId = generateId();

      // Create UI message from parts
      const uiMessage: UIMessage = {
        id: messageId,
        role: "assistant",
        parts: uiMessageParts,
      };

      // Extract text content for legacy content field
      const textParts = uiMessageParts.filter((part) => part.type === "text");
      const content = textParts.map((part) => part.text).join("");

      // Extract tool calls for legacy toolCalls field
      const toolCalls = uiMessageParts
        .filter((part) => part.type?.startsWith("tool-"))
        .map((part) => ({
          toolName: part.type?.replace("tool-", ""),
          toolCallId: part.toolCallId,
          args: part.input,
          result: part.output,
        }));

      // Insert message
      const [newMessage] = await tx
        .insert(message)
        .values({
          id: messageId,
          chatId,
          agentId,
          content,
          uiMessage,
          tokenCount: usage ? usage.inputTokens + usage.outputTokens : 0,
          cost: usage?.cost.toFixed(6) || "0.000000",
          toolCalls,
        })
        .returning();

      // Update chat message count
      await tx
        .update(chat)
        .set({
          messageCount: sql`${chat.messageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(chat.id, chatId));

      logger.info(`Agent ${agentId} responded to chat ${chatId}`);
      return newMessage;
    });
  }

  /**
   * Add agent response message
   */
  static async addAgentMessage(
    chatId: string,
    agentId: string,
    content: string,
    usage?: UsageMetrics,
    toolCalls?: any[],
    uiMessageParts?: any[],
  ): Promise<Message> {
    logger.info("ChatService.addAgentMessage called", {
      chatId,
      agentId,
      contentLength: content.length,
      hasUsage: !!usage,
      hasToolCalls: !!toolCalls,
      hasUiMessageParts: !!uiMessageParts,
      uiMessagePartsCount: uiMessageParts?.length || 0,
    });

    return await db.transaction(async (tx) => {
      logger.info("Starting database transaction for agent message", {
        chatId,
        agentId,
      });

      const messageId = generateId();
      logger.info("Generated message ID", { messageId, chatId, agentId });

      // Create UI message - use provided parts if available, otherwise create from content
      const uiMessage: UIMessage =
        uiMessageParts && uiMessageParts.length > 0
          ? {
              id: messageId,
              role: "assistant",
              parts: uiMessageParts,
            }
          : {
              id: messageId,
              role: "assistant",
              parts: [
                { type: "text", text: content },
                ...(toolCalls || []).map((toolCall: any) => ({
                  type: `tool-${toolCall.toolName}` as const,
                  toolCallId: toolCall.toolCallId,
                  state: "output-available" as const,
                  input: toolCall.args,
                  output: toolCall.result,
                })),
              ],
            };

      logger.info("Created UI message structure", {
        messageId,
        chatId,
        agentId,
        uiMessagePartsUsed: uiMessageParts && uiMessageParts.length > 0,
        uiMessagePartsCount: uiMessage.parts.length,
      });

      // Insert message
      logger.info("Inserting message into database", {
        messageId,
        chatId,
        agentId,
        contentLength: content.length,
        tokenCount: usage ? usage.inputTokens + usage.outputTokens : 0,
        cost: usage?.cost.toFixed(6) || "0.000000",
      });

      const [newMessage] = await tx
        .insert(message)
        .values({
          id: messageId,
          chatId,
          agentId,
          content,
          uiMessage,
          tokenCount: usage ? usage.inputTokens + usage.outputTokens : 0,
          cost: usage?.cost.toFixed(6) || "0.000000",
          toolCalls: toolCalls || [],
        })
        .returning();

      logger.info("Message inserted successfully", {
        messageId: newMessage.id,
        chatId: newMessage.chatId,
        agentId: newMessage.agentId,
        insertedAt: newMessage.createdAt,
      });

      // Update chat message count
      logger.info("Updating chat message count", { chatId });
      await tx
        .update(chat)
        .set({
          messageCount: sql`${chat.messageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(chat.id, chatId));

      logger.info("Chat message count updated successfully", { chatId });
      logger.info(`Agent ${agentId} responded to chat ${chatId}`);

      logger.info("Transaction completed successfully", {
        messageId: newMessage.id,
        chatId,
        agentId,
      });

      return newMessage;
    });
  }

  /**
   * Get user's recent chats
   */
  static async getUserChats(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Chat[]> {
    try {
      return await db
        .select()
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.updatedAt))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      logger.error(`Failed to get chats for user ${userId}:`, { error });
      throw error;
    }
  }

  /**
   * Delete a chat and all related data
   */
  static async deleteChat(chatId: string, userId: string): Promise<void> {
    const chatData = await this.getChatById(chatId, userId);
    if (!chatData || chatData.userId !== userId) {
      throw new Error("Chat not found or access denied");
    }

    await db.transaction(async (tx) => {
      // Delete messages
      await tx.delete(message).where(eq(message.chatId, chatId));

      // Delete chat agents
      await tx.delete(chatAgent).where(eq(chatAgent.chatId, chatId));

      // Delete chat knowledge bases
      await tx
        .delete(chatKnowledgeBase)
        .where(eq(chatKnowledgeBase.chatId, chatId));

      // Delete the chat
      await tx.delete(chat).where(eq(chat.id, chatId));

      // Create audit log
      await tx.insert(auditLog).values({
        userId,
        action: "chat.delete",
        entityType: "chat",
        entityId: chatId,
        details: { title: chatData.title },
      });
    });

    logger.info(`Deleted chat ${chatId} for user ${userId}`);
  }
}
