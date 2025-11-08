"use client";

import { useAgent } from "@/hooks/use-agent-mutations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

interface AgentDetailPageProps {
  params: {
    agentId: string;
  };
}

export default function AgentDetailPage({ params }: AgentDetailPageProps) {
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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/agents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold" style={{ color: agent.color || '#3B82F6' }}>
            {agent.name}
          </h1>
        </div>
        <Button asChild>
          <Link href={`/agents/${agent.id}/edit`}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Agent
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                {agent.description || "No description provided"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {agent.systemPrompt}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-gray-100">
                <div className="py-3 flex justify-between">
                  <dt className="text-gray-500">Model</dt>
                  <dd className="font-medium">{agent.model}</dd>
                </div>
                <div className="py-3 flex justify-between">
                  <dt className="text-gray-500">Temperature</dt>
                  <dd className="font-medium">{agent.temperature}</dd>
                </div>
                <div className="py-3 flex justify-between">
                  <dt className="text-gray-500">Max Tokens</dt>
                  <dd className="font-medium">{agent.maxTokens || 'Not set'}</dd>
                </div>
                <div className="py-3 flex justify-between">
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </dd>
                </div>
                {agent.lastUsedAt && (
                  <div className="py-3 flex justify-between">
                    <dt className="text-gray-500">Last Used</dt>
                    <dd className="font-medium">
                      {new Date(agent.lastUsedAt).toLocaleDateString()}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-gray-100">
                <div className="py-3 flex justify-between">
                  <dt className="text-gray-500">Total Uses</dt>
                  <dd className="font-medium">{agent.usageCount}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
