import type { Chat } from "@circulo-ai/db";

export type ChatHistoryItem = Chat & {
  avatar?: string | null;
  lastMessage?: string | null;
  isPinned: boolean;
  pinOrder?: number | null;
};

export type GetChatHistoryResponse = {
  chats: ChatHistoryItem[];
  hasMore: boolean;
};
