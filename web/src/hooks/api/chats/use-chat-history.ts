import { GetChatHistoryResponse } from "@/app/(chat)/api/history/route";
import { useDebounce } from "@/hooks/use-debounce";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

export function useChatHistory() {
  const { id } = useParams();
  const [currentChatId, setCurrentChatId] = useState<string>();

  useEffect(() => {
    if (Array.isArray(id)) return;
    if (id === currentChatId) return;
    setCurrentChatId(id);
  }, [id]);

  const isChatLoading = useMemo(
    () => id !== currentChatId,
    [id, currentChatId],
  );

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
