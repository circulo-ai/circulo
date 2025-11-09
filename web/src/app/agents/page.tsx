"use client";

import { Suspense } from "react";
import AgentsList from "./agents-list";
import { CreateAgentButton } from "./create-agent-button";

export default function AgentsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Agents</h1>
        <CreateAgentButton />
      </div>

      <Suspense fallback={<div>Loading agents...</div>}>
        <AgentsList />
      </Suspense>
    </div>
  );
}
