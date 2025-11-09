import { useAgentList } from "@/hooks/use-agents";
import { AgentCard } from "./agent-card";

export default function AgentsList() {
  const { agents, isLoading, error } = useAgentList();

  if (isLoading) {
    return <div>Loading agents...</div>;
  }

  if (error) {
    return <div>Error loading agents: {error.message}</div>;
  }

  if (!agents?.length) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium">No agents yet</h3>
        <p className="text-gray-500 mt-2">
          Create your first agent to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
