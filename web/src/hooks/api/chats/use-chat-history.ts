import { Chat } from "@/db/schema";
import { useDebouncedLoading } from "@/hooks/use-debounced-loading";
import { useParams } from "next/navigation";
import useSWR from "swr";

export function useChatHistory() {
  const params = useParams();
  const { id } = params;

  const { isLoading: immediateIsLoading, ...swrResponse } = useSWR<{
    chats: Chat[];
    hasMore: boolean;
  }>("/api/history");

  const isLoading = useDebouncedLoading(immediateIsLoading, 300);

  return {
    ...swrResponse,
    isLoading,
    currentChatId: id,
  };
}
