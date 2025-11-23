import { Agent, Chat, ChatAgent, ChatMember, Message } from "@/db";
import {
  chatAgentRepo,
  chatMemberRepo,
  chatRepo,
  messageRepo,
} from "@/db/repositories";
import { FatalError } from "workflow";

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
  "use step";

  const chat = await chatRepo.findById(chatId);
  if (!chat) {
    throw new FatalError(`Chat ${chatId} not found`);
  }

  const messages = await messageRepo.findForChat(chatId, 100); // Last 100 messages
  const chatAgents = await chatAgentRepo.findForChat(chatId, {
    includeDisabled: false,
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
