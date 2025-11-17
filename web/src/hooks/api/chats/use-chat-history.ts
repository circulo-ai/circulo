import { Chat } from "@/db/schema";
import { useParams } from "next/navigation";
import useSWR from "swr";

export function useChatHistory() {
  const params = useParams();
  const { id } = params;

  return {
    ...useSWR<{
      chats: Chat[];
      hasMore: boolean;
    }>("/api/history"),
    currentChatId: id,
  };
}
