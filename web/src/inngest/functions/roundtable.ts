import { chat, chatAgent, db, message, transaction, wallet } from "@/db";
import { inngest } from "@/inngest/client";
import { calculateCostFromUsage, generateId } from "@/lib/server-utils";
import { emitStreamEvent } from "@/lib/sse";
import { google } from "@ai-sdk/google";
import { Experimental_Agent as Agent } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";

function getProviderModel(model: string) {
  if (model.startsWith("gemini")) return google(model);
  throw new Error(`Unsupported model provider for model: ${model}`);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function buildMessages(agent: any, contextMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [
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

function countTokensApprox(text: string): number {
  // Very rough heuristic: ~4 chars per token (English)
  const len = (text ?? "").trim().length;
  return Math.max(0, Math.ceil(len / 4));
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
    const userMsg = await step.run("save-user-message", async () => {
      const id = generateId();
      const createdAt = new Date();
      await db.insert(message).values({
        id,
        chatId,
        userId,
        content: userMessage,
        createdAt,
      });
      return { id, createdAt };
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
    let contextMessages: Array<{ userId?: string | null; content: string }> = [
      { userId, content: userMessage },
    ];
    let previousMessageId: string | null = userMsg.id;

    for (const ca of agents) {
      const agentInfo = ca.agent;
      const agentResult: { cost: number; tokens: number } = await step.run(
        `agent-${agentInfo.id}`,
        async () => {
          const messages = buildMessages(agentInfo, contextMessages);
          const providerModel = getProviderModel(agentInfo.model);
          const messageId = generateId();

          // Emit message start event
          await emitStreamEvent(chatId, {
            type: "message-start",
            messageId,
            agentId: agentInfo.id,
            role: "assistant",
          });

          const agent = new Agent({
            model: getProviderModel(agentInfo.model),
            system: agentInfo.systemPrompt ?? "You are a helpful assistant",
            temperature: parseFloat(agentInfo.temperature || "0") || undefined,
            maxOutputTokens: agentInfo.maxTokens
              ? Number(agentInfo.maxTokens)
              : undefined,
          });

          // Call AI SDK streamText
          const stream = agent.stream({
            messages,
          });

          const uiMessageStream = stream.toUIMessageStream();

          let generatedText = "";
          let batchIndex = 0;

          // Stream UI messages in batches (UIMessage[])
          for await (const messages of uiMessageStream as any) {
            // Emit the UI messages batch directly
            await emitStreamEvent(chatId, {
              type: "ui-messages",
              messageId,
              agentId: agentInfo.id,
              batchIndex: batchIndex++,
              messages,
            });

            // Accumulate text for database storage
            for (const m of messages) {
              if (m.type === "text-delta") {
                // Support both new "textDelta" and legacy "delta" fields
                const delta = (m.textDelta ?? m.delta) as string | undefined;
                if (delta) generatedText += delta;
              }
            }
          }

          // Get final response
          const final = await stream.response;
          const content = generatedText;

          // Calculate tokens and cost
          const inputText = messages.map((m) => m.content).join("\n\n");
          const inputTokens =
            (final as any)?.usage?.inputTokens ?? countTokensApprox(inputText);
          const outputTokens =
            (final as any)?.usage?.outputTokens ?? countTokensApprox(content);
          const totalTokens =
            (final as any)?.usage?.totalTokens ?? inputTokens + outputTokens;

          const cost = calculateCostFromUsage(
            agentInfo.model,
            inputTokens,
            outputTokens,
          );

          if (remainingBalance < cost) {
            throw new Error(`Insufficient balance for agent ${agentInfo.name}`);
          }
          remainingBalance -= cost;

          // Save the agent's message
          const msg = {
            id: messageId,
            chatId,
            agentId: agentInfo.id,
            content,
            tokenCount: totalTokens,
            cost: cost.toString(),
            toolCalls: [],
            quotedMessageId: previousMessageId,
            createdAt: new Date(),
          };
          await db.insert(message).values(msg);

          contextMessages.push({ userId: null, content });
          previousMessageId = msg.id;

          // Emit message complete event
          await emitStreamEvent(chatId, {
            type: "message-complete",
            messageId: msg.id,
            agentId: agentInfo.id,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens,
            },
            cost,
          });

          return { cost, tokens: totalTokens };
        },
      );

      costs.push(agentResult);
      if (ca !== agents[agents.length - 1]) {
        await step.sleep("delay", 1000);
      }
    }

    // STEP 5: Deduct total cost & record transaction
    await step.run("charge-user", async () => {
      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
      const totalTokens = costs.reduce((sum, c) => sum + c.tokens, 0);

      await db.transaction(async (tx) => {
        const updated = await tx
          .update(wallet)
          .set({
            balance: sql`${wallet.balance} - ${totalCost}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wallet.userId, userId),
              sql`${wallet.balance} >= ${totalCost}`,
            ),
          )
          .returning({ id: wallet.id, balance: wallet.balance });

        if (updated.length === 0) {
          throw new Error(
            "Insufficient wallet balance or concurrent spend detected",
          );
        }

        const walletRow = updated[0];
        const balanceAfter = Number(walletRow.balance);
        const balanceBefore = balanceAfter + totalCost;

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
          walletId: walletRow.id,
          type: "chat_usage",
          status: "completed",
          amount: totalCost.toFixed(4),
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceAfter.toFixed(2),
          chatId,
          description: "Chat roundtable execution",
          metadata: { agents: agents.map((a) => a.agentId), totalTokens },
        });
      });
    });

    return { success: true };
  },
);
