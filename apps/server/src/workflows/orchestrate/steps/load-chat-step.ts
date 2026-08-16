import {
  db,
  type Agent,
  type Chat,
  type ChatAgent,
  type ChatMember,
  type Message,
} from "@/db";
import { chatMemberRepo, chatRepo, messageRepo } from "@/db/repositories";
import { chatAgent } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface ChatContext {
  chat: Chat;
  agents: Array<ChatAgent & { agent: Agent }>;
  messages: Message[];
  members: Array<
    ChatMember & { user: { id: string; name: string; email: string } }
  >;
}

export async function loadChatContextStep(
  chatId: string,
): Promise<ChatContext> {
  const chat = await chatRepo.findById(chatId);
  if (!chat) {
    throw new Error(`Chat ${chatId} not found`);
  }

  const messages = await messageRepo.findForChat(chatId, 100); // Last 100 messages

  // Use the correct method to get ChatAgent objects with agent relations
  const chatAgents = await db.query.chatAgent.findMany({
    where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
    with: { agent: true },
  });

  const members = await chatMemberRepo.findForChat(chatId);

  if (!chatAgents || chatAgents.length === 0) {
    console.warn(`No active agents found in chat ${chatId}`);
  }

  return {
    chat,
    agents: chatAgents,
    messages,
    members,
  };
}
