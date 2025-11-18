import { GetChatHistoryResponse } from "@/app/(chat)/api/history/route";
import { useDebounce } from "@/hooks/use-debounce";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

export function useChatHistory() {
  const params = useParams();
  const { id } = params;

  const [search, setSearch] = useState("");
  const { debouncedState: debouncedSearch } = useDebounce(search, 300);

  const swrResponse = useSWR<GetChatHistoryResponse>(() => [
    "/api/history",
    { search: debouncedSearch },
  ]);

  return {
    ...swrResponse,
    currentChatId: id,
    search,
    setSearch,
  };
}
