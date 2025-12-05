import { useDebounce } from "@/hooks/use-debounce";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import type { GetChatHistoryResponse } from "@/types/history";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

export function useChatHistory() {
  const { id } = useParams();
  const { currentChatId, setCurrentChatId, setIsChatLoading } =
    useChatHistoryStore();

  useEffect(() => {
    let safeId = id;
    if (Array.isArray(safeId)) safeId = safeId[0];
    if (safeId === currentChatId) return;
    setCurrentChatId(safeId);
  }, [id]);

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
      (a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0), // TODO check if this is fine (the nullish coalescing operators)
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
    search,
    setSearch,
    debouncedSearch,
  };
}

// TODO useDebouncedLoading for the isLoading state of the history?
// TODO implement drag and drop for the pinned chats
