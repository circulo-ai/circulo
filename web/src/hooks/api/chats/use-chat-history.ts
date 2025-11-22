import { GetChatHistoryResponse } from "@/app/(chat)/api/history/route";
import { useDebounce } from "@/hooks/use-debounce";
import { useDebouncedLoading } from "@/hooks/use-debounced-loading";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { create } from "zustand";

interface ChatHistoryStore {
  isChatLoading: boolean;
  setIsChatLoading: (isChatLoading: boolean) => void;
}

const useChatHistoryStore = create<ChatHistoryStore>()((set) => ({
  isChatLoading: false,
  setIsChatLoading: (isChatLoading) => set({ isChatLoading }),
}));

export function useChatHistory() {
  const { id } = useParams();
  const [currentChatId, setCurrentChatId] = useState<string>();

  useEffect(() => {
    let safeId = id;
    if (Array.isArray(safeId)) safeId = safeId[0];
    if (safeId === currentChatId) return;
    setCurrentChatId(safeId);
  }, [id]);

  const { setIsChatLoading } = useChatHistoryStore();

  useEffect(() => {
    let safeId = id;
    if (Array.isArray(safeId)) safeId = safeId[0];
    setIsChatLoading(safeId !== currentChatId);
  }, [id, currentChatId]);

  const [search, setSearch] = useState("");
  const { debouncedState: debouncedSearch } = useDebounce(search, 300);

  const swrResponse = useSWR<GetChatHistoryResponse>(() => [
    "/api/history",
    { search: debouncedSearch },
  ]);

  return {
    ...swrResponse,
    currentChatId,
    setCurrentChatId,
    search,
    setSearch,
  };
}

export function useIsChatLoading() {
  const { isChatLoading } = useChatHistoryStore();
  return { isChatLoading: useDebouncedLoading(isChatLoading) };
}

// TODO useDebouncedLoading?
