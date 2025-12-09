import type { Chat } from "@circulo-ai/db";

export type ChatHistoryItem = Chat & {
  isPinned: boolean;
  pinOrder?: number | null;
};

export type GetChatHistoryResponse = {
  chats: ChatHistoryItem[];
  hasMore: boolean;
};
