import { GetChatHistoryResponse } from "@/app/(chat)/api/history/route";
import { useDebounce } from "@/hooks/use-debounce";
import { useChatHistoryStore } from "@/stores/chat-history";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

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

// TODO useDebouncedLoading?
