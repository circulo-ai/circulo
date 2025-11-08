"use client";

import { useSWR } from "@/lib/swr";
import { type Agent } from "@/db/schema/agent";

export function useAgents() {
  const { data, error, isLoading, mutate } = useSWR<{ data: { agents: Agent[] } }>(
    "/api/v1/agents"
  );

  const agents = data?.data?.agents ?? [];

  async function createAgent(payload: {
    name: string;
    description?: string;
    systemPrompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    avatar?: string;
    color?: string;
    tools?: any[];
  }) {
    const res = await fetch("/api/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create agent");
    await mutate((prev) => ({ data: { agents: [json.data.agent, ...(prev?.data?.agents ?? [])] } }), {
      revalidate: false,
    });
    return json.data as { agent: Agent };
  }

  return {
    agents,
    isLoading,
    error,
    refresh: () => mutate(),
    createAgent,
  };
}
