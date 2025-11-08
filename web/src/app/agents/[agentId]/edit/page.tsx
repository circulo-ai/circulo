"use client";

import { useAgent } from "@/hooks/use-agent-mutations";
import { Suspense } from "react";
import { EditAgentForm } from "./edit-agent-form";

interface EditAgentPageProps {
  params: {
    agentId: string;
  };
}

export default function EditAgentPage({ params }: EditAgentPageProps) {
  const { agent, isLoading, error } = useAgent(params.agentId);

  if (isLoading) {
    return <div>Loading agent...</div>;
  }

  if (error) {
    return <div>Error loading agent: {error.message}</div>;
  }

  if (!agent) {
    return <div>Agent not found</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Edit Agent: {agent.name}</h1>

      <Suspense fallback={<div>Loading form...</div>}>
        <EditAgentForm agent={agent} />
      </Suspense>
    </div>
  );
}
