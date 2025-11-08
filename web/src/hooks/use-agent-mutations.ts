import { Agent } from "@/db/schema";
import { fetcher } from "@/lib/swr";
import useSWR, { useSWRConfig } from "swr";

const AGENTS_API_BASE = "/api/v1/agents";

export function useAgentList() {
  const { data, error, isLoading } = useSWR<Agent[]>(
    AGENTS_API_BASE,
    fetcher
  );

  return {
    agents: data,
    isLoading,
    error
  };
}

export function useAgent(agentId: string) {
  const { data, error, isLoading } = useSWR<Agent>(
    agentId ? `${AGENTS_API_BASE}/${agentId}` : null,
    fetcher
  );

  return {
    agent: data,
    isLoading,
    error
  };
}

export function useAgentMutations() {
  const { mutate } = useSWRConfig();

  const createAgent = async (data: Partial<Agent>) => {
    const response = await fetch(AGENTS_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error("Failed to create agent");
    }

    const newAgent = await response.json();
    await mutate(AGENTS_API_BASE); // Revalidate the agents list
    return newAgent;
  };

  const updateAgent = async (agentId: string, data: Partial<Agent>) => {
    const response = await fetch(`${AGENTS_API_BASE}/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to update agent");
    }

    const updatedAgent = await response.json();
    await Promise.all([
      mutate(AGENTS_API_BASE), // Revalidate the agents list
      mutate(`${AGENTS_API_BASE}/${agentId}`), // Revalidate the specific agent
    ]);
    return updatedAgent;
  };

  const deleteAgent = async (agentId: string) => {
    const response = await fetch(`${AGENTS_API_BASE}/${agentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete agent");
    }

    await mutate(AGENTS_API_BASE); // Revalidate the agents list
  };

  return {
    createAgent,
    updateAgent,
    deleteAgent,
  };
}