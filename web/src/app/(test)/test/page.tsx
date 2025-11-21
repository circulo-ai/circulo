"use client";

import { toolRegistry } from "@/ai/tools/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveOrganization } from "@/lib/auth-client";
import { fetchWithErrorHandlers } from "@/lib/swr";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function TestToolsPage() {
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [userConfigs, setUserConfigs] = useState<
    Record<string, Record<string, any>>
  >({});
  const [showToolDetails, setShowToolDetails] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { data } = useActiveOrganization();

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/test",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        return {
          body: {
            ...request,
            orgId: data?.id,
            toolIds: selectedTools,
          },
        };
      },
    }),
  });

  const { messages, error, sendMessage } = chat;

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId)
        ? prev.filter((id) => id !== toolId)
        : [...prev, toolId],
    );
  };

  const updateUserConfig = (
    toolId: string,
    paramKey: string,
    value: string,
  ) => {
    setUserConfigs((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        [paramKey]: value,
      },
    }));
  };

  const selectAllTools = () =>
    setSelectedTools(toolRegistry.getAll().map((t) => t.id));
  const clearAllTools = () => setSelectedTools([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setIsLoading(true);
    await sendMessage({ text: input });
    setIsLoading(false);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tool Testing Interface</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Select tools, configure params, and start chatting.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Tool Selection Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Available Tools</CardTitle>
                  <Badge variant="outline">
                    {selectedTools.length} selected
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={selectAllTools}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={clearAllTools}
                    >
                      Clear
                    </Button>
                  </div>
                  <ScrollArea className="h-96">
                    <div className="space-y-2">
                      {toolRegistry.getAll().map((def) => (
                        <div
                          key={def.id}
                          className="flex items-start gap-3 rounded-md border p-3"
                        >
                          <Checkbox
                            checked={selectedTools.includes(def.id)}
                            onCheckedChange={() => toggleTool(def.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <Label className="text-sm font-medium">
                              {def.name}
                            </Label>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {def.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button
                    variant="secondary"
                    className="mt-4 w-full"
                    onClick={() => setShowToolDetails(!showToolDetails)}
                  >
                    {showToolDetails ? "Hide" : "Show"} Tool Details
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-2">
            <Card className="flex h-[calc(100vh-12rem)] flex-col">
              {/* Messages */}
              <CardContent className="flex-1 space-y-4 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="mt-12 text-center text-gray-500">
                    <div className="mb-4 text-4xl">🛠️</div>
                    <p className="mb-2 text-lg font-medium">
                      Ready to test tools
                    </p>
                    <p className="text-sm">
                      Select tools, configure params, and start chatting
                    </p>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-3xl rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      {message.parts?.length ? (
                        <div className="mt-1 space-y-3">
                          {message.parts.map((part, idx) => {
                            const p = part as any;
                            if (p.type === "text") {
                              return (
                                <div
                                  key={idx}
                                  className="text-sm whitespace-pre-wrap"
                                >
                                  {p.text}
                                </div>
                              );
                            }
                            if (p.type === "tool-invocation") {
                              return (
                                <div
                                  key={idx}
                                  className="rounded bg-white/10 p-3 text-sm"
                                >
                                  <div className="mb-2 flex items-center gap-2">
                                    <span className="font-semibold">
                                      🔧 {p.toolName}
                                    </span>
                                    <span className="text-xs opacity-75">
                                      {p.state}
                                    </span>
                                  </div>
                                  {p.args && (
                                    <div className="mb-2">
                                      <div className="mb-1 text-xs opacity-75">
                                        Arguments
                                      </div>
                                      <pre className="overflow-x-auto rounded bg-black/20 p-2 text-xs">
                                        {JSON.stringify(p.args, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {p.result && (
                                    <div>
                                      <div className="mb-1 text-xs opacity-75">
                                        Result
                                      </div>
                                      <pre className="max-h-40 overflow-x-auto rounded bg-black/20 p-2 text-xs">
                                        {JSON.stringify(p.result, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ) : (
                        <div className="text-sm whitespace-pre-wrap">
                          {(message as any).content || ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <Badge variant="secondary">Thinking…</Badge>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                    <strong>Error:</strong> {error.message}
                  </div>
                )}
              </CardContent>

              <div className="border-t p-4">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={handleInputChange}
                    placeholder={
                      selectedTools.length > 0
                        ? "Ask the model to use the selected tools..."
                        : "Select tools first, then start chatting..."
                    }
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading || !input.trim()}>
                    {isLoading ? "Sending..." : "Send"}
                  </Button>
                </form>
                <div className="mt-2 text-xs text-muted-foreground">
                  {selectedTools.length} tool(s) selected • Max 5 steps
                </div>
              </div>
            </Card>
          </div>
        </div>

        {showToolDetails && selectedTools.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Selected Tool Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedTools.map((toolId) => {
                  const def = toolRegistry.get(toolId);
                  if (!def) return null;
                  const paramsShape =
                    (def.parametersSchema as any)?.shape || {};
                  return (
                    <div key={toolId} className="rounded-md border p-4">
                      <h4 className="mb-2 text-sm font-medium">{def.name}</h4>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {def.description}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="mb-2 text-xs font-semibold">
                            Parameters
                          </div>
                          <div className="space-y-1 text-xs">
                            {Object.keys(paramsShape).map((key) => (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <Badge variant="secondary">{key}</Badge>
                                <span className="text-muted-foreground">
                                  input
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold">
                            Required Env
                          </div>
                          <div className="space-y-1 text-xs">
                            {def.requiredEnvVars.map((k) => (
                              <div key={k} className="flex items-center gap-2">
                                <Badge variant="secondary">{k}</Badge>
                                <span className="text-muted-foreground">
                                  required
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
