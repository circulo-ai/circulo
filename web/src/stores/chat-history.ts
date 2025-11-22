import { create } from "zustand";

interface ChatHistoryStore {
  isChatLoading: boolean;
  setIsChatLoading: (isChatLoading: boolean) => void;
}

export const useChatHistoryStore = create<ChatHistoryStore>()((set) => ({
  isChatLoading: false,
  setIsChatLoading: (isChatLoading) => set({ isChatLoading }),
}));
