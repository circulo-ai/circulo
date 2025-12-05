import type { Chat } from "@/db";

export type ChatHistoryItem = Chat & {
  isPinned: boolean;
  pinOrder?: number | null;
};

export type GetChatHistoryResponse = {
  chats: ChatHistoryItem[];
  hasMore: boolean;
};
