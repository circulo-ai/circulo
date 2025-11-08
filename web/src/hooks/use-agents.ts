"use client";

import { useSWR } from "@/lib/swr";
import { type Agent } from "@/db/schema/agent";

export function useAgents() {
  const { data, error, isLoading, mutate } = useSWR<{ agents: Agent[] }>(
    "/api/v1/agents"
  );

  const agents = data?.agents ?? [];

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
    await mutate((prev) => ({ agents: [json.agent, ...(prev?.agents ?? [])] }), {
      revalidate: false,
    });
    return json as { agent: Agent };
  }

  return {
    agents,
    isLoading,
    error,
    refresh: () => mutate(),
    createAgent,
  };
}