"use client";

import { useSWR, fetcher } from "@/lib/swr";
import { type Agent } from "@/db/schema/agent";
import { useParams } from "next/navigation";

export function useChatAgents() {
  const { chatId } = useParams() as { chatId?: string };
  const { data, error, isLoading, mutate } = useSWR<{
    data: { agents: Agent[] };
  }>(chatId ? `/api/v1/chats/${chatId}/agents` : null);

  const agents = data?.data?.agents ?? [];

  const addAgent = async (params: {
    agentId: string;
    speakOrder?: number;
    customSystemPrompt?: string | null;
    customTemperature?: number | null;
  }) => {
    if (!chatId) return;
    await fetcher(`/api/v1/chats/${chatId}/agents`, {
      method: "POST",
      body: JSON.stringify(params),
      headers: { "Content-Type": "application/json" },
    });
    mutate();
  };

  const updateAgent = async (
    agentId: string,
    update: {
      speakOrder?: number;
      enabled?: boolean;
      customSystemPrompt?: string | null;
      customTemperature?: number | null;
    }
  ) => {
    if (!chatId) return;
    // The PATCH endpoint accepts a batch `updates` array. Wrap the single update
    // into the expected shape: { updates: [{ agentId, ...update }] }
    await fetcher(`/api/v1/chats/${chatId}/agents`, {
      method: "PATCH",
      body: JSON.stringify({ updates: [{ agentId, ...update }] }),
      headers: { "Content-Type": "application/json" },
    });
    mutate();
  };

  const reorderAgents = async (updatesArr: Array<{
    agentId: string;
    speakOrder?: number;
    enabled?: boolean;
    customSystemPrompt?: string | null;
    customTemperature?: number | null;
  }>) => {
    if (!chatId) return;
    await fetcher(`/api/v1/chats/${chatId}/agents`, {
      method: "PATCH",
      body: JSON.stringify({ updates: updatesArr }),
      headers: { "Content-Type": "application/json" },
    });
    mutate();
  };

  const removeAgent = async (agentId: string) => {
    if (!chatId) return;
    // DELETE expects a JSON body { agentId }
    await fetcher(`/api/v1/chats/${chatId}/agents`, {
      method: "DELETE",
      body: JSON.stringify({ agentId }),
      headers: { "Content-Type": "application/json" },
    });
    mutate();
  };

  return {
    agents,
    isLoading,
    error,
    refresh: () => mutate(),
    addAgent,
    updateAgent,
    reorderAgents,
    removeAgent,
  };
}
