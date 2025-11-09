import type { UIMessage } from "ai";
import { messageRepo } from "@/db/repositories/message-repo";
import { getAssistantAgentId } from "@/lib/chat/assistant-agent";

/**
 * Persist the assistant response directly using DB repositories.
 */
export async function persistAssistant(chatId: string, userId: string, text: string, messageId: string) {
  "use step";

  if (!text?.trim()) return;

  try {
    const assistantAgentId = await getAssistantAgentId(chatId, userId);
    const uiMessage: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: [{ type: "text", text }],
      metadata: { createdAt: Date.now() },
    };
    await messageRepo.create({
      id: crypto.randomUUID(),
      chatId,
      userId: null,
      agentId: assistantAgentId,
      content: text,
      tokenCount: 0,
      cost: "0.000000",
      toolCalls: [],
      uiMessage,
      mentionedAgentIds: [],
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[Persist Assistant Step] failed:", err);
  }
}
