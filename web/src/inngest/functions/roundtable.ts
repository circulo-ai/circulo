import { chat, chatAgent, db, message, transaction, wallet } from "@/db";
import { inngest } from "@/inngest/client";
import { calculateCostFromUsage, generateId } from "@/lib/server-utils";
import { emitStreamEvent } from "@/lib/sse";
import { google } from "@ai-sdk/google";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";

function getProviderModel(model: string) {
  if (model.startsWith("gemini")) return google(model);
  throw new Error(`Unsupported model provider for model: ${model}`);
}

function buildMessages(agent: any, contextMessages: any[]): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: "system",
      content: agent.systemPrompt ?? "",
    },
  ];

  for (const m of contextMessages) {
    if (m.userId) {
      messages.push({ role: "user", content: m.content ?? "" });
    } else {
      messages.push({ role: "assistant", content: m.content ?? "" });
    }
  }

  return messages;
}

export const chatRoundtable = inngest.createFunction(
  {
    id: "chat-roundtable",
    concurrency: { limit: 100 },
  },
  { event: "chat/roundtable.start" },
  async ({ event, step }) => {
    const { chatId, userId, userMessage } = event.data;

    // STEP 1: Save user message
    await step.run("save-user-message", async () => {
      await db.insert(message).values({
        id: generateId(),
        chatId,
        userId,
        content: userMessage,
        createdAt: new Date(),
      });
    });

    // STEP 2: Check wallet
    const userWallet = await step.run("check-wallet", async () => {
      const w = await db.query.wallet.findFirst({
        where: eq(wallet.userId, userId),
      });
      if (!w) throw new Error("Wallet not found");
      if (Number(w.balance) <= 0) throw new Error("Insufficient balance");
      return w;
    });

    // STEP 3: Load enabled agents
    const agents = await step.run("get-agents", async () => {
      return await db.query.chatAgent.findMany({
        where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
        orderBy: [asc(chatAgent.speakOrder)],
        with: { agent: true },
      });
    });

    const costs: { cost: number; tokens: number }[] = [];
    let remainingBalance = Number(userWallet.balance);

    // STEP 4: Sequentially process agents
    let contextMessages = await db.query.message.findMany({
      where: eq(message.chatId, chatId),
      orderBy: [asc(message.createdAt)], // chronological
    });

    for (const ca of agents) {
      const agent = ca.agent;
      const result = await step.run(`agent-${agent.id}`, async () => {
        const messages = buildMessages(agent, contextMessages);

        // --- Prepare provider ---
        const providerModel = getProviderModel(agent.model);

        // --- Call AI SDK generateText ---
        const response = await generateText({
          model: providerModel,
          messages,
          temperature: parseFloat(agent.temperature || "0") || undefined,
          maxOutputTokens: agent.maxTokens
            ? Number(agent.maxTokens)
            : undefined,
        });

        const content = response.text;
        const usage = response.totalUsage || response.usage;

        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

        // --- Calculate cost manually ---
        const cost = calculateCostFromUsage(
          agent.model,
          inputTokens,
          outputTokens,
        );

        // --- Ensure sufficient funds ---
        if (remainingBalance < cost) {
          throw new Error(`Insufficient balance for agent ${agent.name}`);
        }
        remainingBalance -= cost;

        for await (const step of response.steps) {
          // TODO
          await emitStreamEvent(chatId, {
            type: "stream",
            agentId: chatAgent.agentId,
            content: ""
          });
        }

        // Save the agent’s message
        const msg = {
          id: generateId(),
          chatId,
          agentId: agent.id,
          content,
          tokenCount: totalTokens,
          cost: cost.toString(),
          toolCalls: response.toolCalls ?? [],
          createdAt: new Date(),
        };
        await db.insert(message).values(msg);

        // Add DB-style message (no role) to context for the next agent
        contextMessages.push({
          ...msg,
          userId: null,
          quotedMessageId: null,
        });

        // Emit completion event
        await emitStreamEvent(chatId, {
          type: "complete",
          agentId: chatAgent.agentId,
          messageId: msg.id,
        });

        return { cost, tokens: totalTokens };
      });

      costs.push(result);
      if (ca !== agents[agents.length - 1]) {
        await step.sleep("delay", 1000);
      }
    }

    // STEP 5: Deduct total cost & record transaction atomically
    await step.run("charge-user", async () => {
      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
      const totalTokens = costs.reduce((sum, c) => sum + c.tokens, 0);

      const currentWallet = await db.query.wallet.findFirst({
        where: eq(wallet.userId, userId),
      });

      if (!currentWallet) throw new Error("Wallet not found");
      if (Number(currentWallet.balance) < totalCost)
        throw new Error("Insufficient wallet balance before deduction");

      const balanceBefore = Number(currentWallet.balance);
      const balanceAfter = balanceBefore - totalCost;

      await db.transaction(async (tx) => {
        await tx
          .update(wallet)
          .set({
            balance: balanceAfter.toString(),
            updatedAt: new Date(),
          })
          .where(eq(wallet.userId, userId));

        await tx
          .update(chat)
          .set({
            messageCount: sql`${chat.messageCount} + ${agents.length + 1}`,
            totalTokens: sql`${chat.totalTokens} + ${totalTokens}`,
            totalCost: sql`${chat.totalCost} + ${totalCost}`,
            updatedAt: new Date(),
          })
          .where(eq(chat.id, chatId));

        await tx.insert(transaction).values({
          id: generateId(),
          userId,
          walletId: currentWallet.id,
          type: "chat_usage",
          status: "completed",
          amount: totalCost.toString(),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          chatId,
          description: "Chat roundtable execution",
          metadata: { agents: agents.map((a) => a.agentId), totalTokens },
        });
      });
    });

    return { success: true };
  },
);
