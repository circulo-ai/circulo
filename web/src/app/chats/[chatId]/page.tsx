"use client";

import { useParams, useRouter } from "next/navigation";
import { useMessages } from "@/hooks/use-messages";
import { useChatAgents } from "@/hooks/use-chat-agents";
import { useAgentList, useAgents } from "@/hooks/use-agents";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { Fragment, useMemo, useState, useEffect } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { AgentSelector } from "@/components/ai-elements/agent-selector";
import { ChatAgentManager } from "@/components/ai-elements/agent-manager";
import { Button } from "@/components/ui/button";
import { Settings, Users } from "lucide-react";

// Utility: convert stored DB message to UIMessage-like for rendering
function toUIMessages(
  dbMessages: Array<{
    uiMessage: any;
    content: string;
    userId: string | null;
    agentId: string | null;
  }>
) {
  return dbMessages.map((m) => {
    if (m.uiMessage) return m.uiMessage;
    const role = m.userId ? "user" : "assistant";
    return {
      id: Math.random().toString(36).slice(2),
      role,
      parts: [{ type: "text", text: m.content }],
    };
  });
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params?.chatId);

  const { messages: serverMessages, chat, isLoading } = useMessages(chatId);
  const {
    agents: chatAgents,
    isLoading: isLoadingAgents,
    addAgent,
    removeAgent,
    reorderAgents
  } = useChatAgents();
  const { agents: allAgents } = useAgentList();

  const [input, setInput] = useState("");
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isAddingAgents, setIsAddingAgents] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/v1/chats/${chatId}` }),
    [chatId]
  );

  const { messages: liveMessages, sendMessage, status } = useChat({ transport });

  const combined: UIMessage[] = useMemo(() => {
    const base = toUIMessages(serverMessages);
    const merged: UIMessage[] = [];
    const indexById = new Map<string, number>();

    // Add server messages first
    for (const m of base) {
      if (!indexById.has(m.id)) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      }
    }

    // Merge live messages, replacing duplicates by id
    for (const m of liveMessages) {
      const idx = indexById.get(m.id);
      if (idx === undefined) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      } else {
        merged[idx] = m;
      }
    }

    return merged;
  }, [serverMessages, liveMessages]);

  // Show agent selector if no agents are configured yet and no messages
  const showAgentSelector = !isLoadingAgents && chatAgents.length === 0 && combined.length === 0;
  const hasMessages = combined.length > 0;

  const handleSubmit = async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text) || Boolean(message.files?.length);
    if (!hasText) return;

    // If no agents selected yet, show warning
    if (chatAgents.length === 0 && selectedAgentIds.length === 0) {
      alert("Please select at least one agent to start the conversation");
      return;
    }

    // If agents selected but not yet added to chat, add them first
    if (selectedAgentIds.length > 0 && chatAgents.length === 0) {
      setIsAddingAgents(true);
      try {
        // Add all selected agents with their order
        for (let i = 0; i < selectedAgentIds.length; i++) {
          await addAgent({
            agentId: selectedAgentIds[i],
            speakOrder: i,
          });
        }
        // Clear selection after adding
        setSelectedAgentIds([]);
      } catch (error) {
        console.error("Failed to add agents:", error);
        alert("Failed to add agents to chat. Please try again.");
        setIsAddingAgents(false);
        return;
      }
      setIsAddingAgents(false);
    }

    // Send the message
    sendMessage({
      text: message.text || "Sent with attachments",
      files: message.files,
    });
    setInput("");
  };

  const handleAgentSelection = (agentIds: string[]) => {
    setSelectedAgentIds(agentIds);
  };

  const handleReorderAgents = async (reorderedAgents: Array<{ agentId: string; speakOrder: number }>) => {
    await reorderAgents(reorderedAgents);
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (confirm("Remove this agent from the chat?")) {
      await removeAgent(agentId);
    }
  };

  // Auto-show agent manager on first load if there are messages but want to manage agents
  useEffect(() => {
    if (chatAgents.length > 0 && !hasMessages) {
      // User might want to adjust agents before starting
    }
  }, [chatAgents.length, hasMessages]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
        <span className="ml-2 text-sm text-muted-foreground">Loading chat...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{chat?.title ?? "Chat"}</h1>
          {chat?.description && (
            <p className="text-sm text-muted-foreground truncate">{chat.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {chatAgents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAgentManager(!showAgentManager)}
            >
              <Users className="h-4 w-4 mr-2" />
              Agents ({chatAgents.length})
            </Button>
          )}
        </div>
      </div>

      {/* Agent Manager Drawer */}
      {showAgentManager && (
        <div className="border-b bg-muted/50">
          <ChatAgentManager
            chatAgents={chatAgents}
            allAgents={allAgents}
            onReorder={handleReorderAgents}
            onRemove={handleRemoveAgent}
            onClose={() => setShowAgentManager(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {showAgentSelector ? (
          /* Agent Selection View - Show when no agents configured */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Start a New Conversation</h2>
                <p className="text-muted-foreground">
                  Select one or more agents to participate in this chat. You can reorder them to
                  control the speaking sequence.
                </p>
              </div>
              <AgentSelector
                availableAgents={allAgents}
                selectedAgentIds={selectedAgentIds}
                onSelectionChange={handleAgentSelection}
                isLoading={isLoadingAgents}
              />
            </div>
          </div>
        ) : (
          /* Conversation View */
          <Conversation className="flex-1">
            <ConversationContent>
              {combined.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Ready to Chat</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {chatAgents.length > 0 ? (
                      <>
                        You have {chatAgents.length} agent{chatAgents.length !== 1 ? 's' : ''} in
                        this chat. Type a message below to start the conversation.
                      </>
                    ) : (
                      <>Type a message and select agents to begin.</>
                    )}
                  </p>
                </div>
              )}
              {combined.map((message) => (
                <div key={message.id}>
                  {message.parts.map((part: any, i: number) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <Fragment key={`${message.id}-${i}`}>
                            <Message from={message.role}>
                              <MessageContent>
                                <Response>{part.text}</Response>
                              </MessageContent>
                            </Message>
                          </Fragment>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              ))}
              {(status === "submitted" || isAddingAgents) && (
                <div className="flex items-center gap-2 p-4">
                  <Loader />
                  {isAddingAgents && (
                    <span className="text-sm text-muted-foreground">Adding agents...</span>
                  )}
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        {/* Prompt Input */}
        <div className="border-t p-4">
          {showAgentSelector ? (
            /* Agent selection mode prompt */
            <div className="space-y-3">
              {selectedAgentIds.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? 's' : ''} selected
                </div>
              )}
              <PromptInput
                onSubmit={handleSubmit}
                globalDrop
                multiple
              >
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder={
                      selectedAgentIds.length > 0
                        ? "Type your first message to start the conversation..."
                        : "Select agents above, then type your message here..."
                    }
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    disabled={selectedAgentIds.length === 0 || isAddingAgents}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputSubmit
                    disabled={!input.trim() || selectedAgentIds.length === 0 || isAddingAgents}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          ) : (
            /* Normal chat mode prompt */
            <PromptInput onSubmit={handleSubmit} globalDrop multiple>
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="Type a message..."
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputSubmit disabled={!input.trim()} />
              </PromptInputFooter>
            </PromptInput>
          )}
        </div>
      </div>
    </div>
  );
}