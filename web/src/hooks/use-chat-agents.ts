"use client";

import { useSWR } from "@/lib/swr";
import { type Agent } from "@/db/schema/agent";

export function useChatAgents(chatId: string) {
  const { data, error, isLoading, mutate } = useSWR<{
    data: { agents: Agent[] };
  }>(`/api/v1/chats/${chatId}/agents`);

  const agents = data?.data?.agents ?? [];

  return {
    agents,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}