import { GetChatHistoryResponse } from "@/app/api/history/route";
import { useDebounce } from "@/hooks/use-debounce";
import { useDebouncedLoading } from "@/hooks/use-debounced-loading";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

  const { data, ...history } = useSWR<GetChatHistoryResponse>([
    "/api/history",
    { search: debouncedSearch },
  ]);

  const sortedData = useMemo(() => {
    if (data === undefined) return undefined;
    if (data.chats.length === 0) return data;

    const pinnedChats = data.chats.filter((c) => c.isPinned);
    const unPinnedChats = data.chats.filter((c) => !c.isPinned);
    const sortedPinnedChats = pinnedChats.sort(
      (a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0),
    );

    return {
      ...data,
      chats: [...sortedPinnedChats, ...unPinnedChats],
    };
  }, [data]);

  return {
    history: {
      data: sortedData,
      ...history,
    },
    currentChatId,
    setCurrentChatId,
    search,
    debouncedSearch,
    setSearch,
  };
}

export function useIsChatLoading() {
  const { isChatLoading } = useChatHistoryStore();
  return { isChatLoading: useDebouncedLoading(isChatLoading) };
}

// TODO useDebouncedLoading for the isLoading state of the history?
