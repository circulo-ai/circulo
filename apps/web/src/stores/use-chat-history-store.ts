import { useDebouncedLoading } from "@/hooks/use-debounced-loading";
import { create } from "zustand";

interface ChatHistoryStore {
  isChatLoading: boolean;
  setIsChatLoading: (isChatLoading: boolean) => void;
  currentChatId?: string;
  setCurrentChatId: (currentChatId?: string) => void;
}

const useStore = create<ChatHistoryStore>()((set) => ({
  isChatLoading: false,
  setIsChatLoading: (isChatLoading) => set({ isChatLoading }),
  currentChatId: undefined,
  setCurrentChatId: (currentChatId) => set({ currentChatId }),
}));

export function useChatHistoryStore() {
  const { isChatLoading, ...store } = useStore();
  return {
    isChatLoading: useDebouncedLoading(isChatLoading),
    ...store,
  };
}
