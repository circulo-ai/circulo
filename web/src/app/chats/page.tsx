"use client";

import { Action, Actions } from "@/components/ai-elements/actions";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea, PromptInputTextareaWithMentions,
  PromptInputTools
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CopyIcon, GlobeIcon, RefreshCcwIcon, Users, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useChats } from "@/hooks/use-chats";
import { useAgentList, useAgents } from "@/hooks/use-agents";
import { useChatAgents } from "@/hooks/use-chat-agents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { AgentSelector } from "@/components/ai-elements/agent-selector";
import { MentionEntity } from "@/lib/chat/mentions/types";
import { useMentionInput } from "@/hooks/use-mention-input";
import { parseMessageMentions } from "@/lib/chat/mentions/server";

const models = [
  {
    name: "gemini-2.5-flash",
    value: "openai/gpt-4o",
  },
  {
    name: "Deepseek R1",
    value: "deepseek/deepseek-r1",
  },
];

const ChatBotDemo = () => {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  const { createChat } = useChats();
  const { agents: allAgents, isLoading: isLoadingAgents } = useAgentList();

  const [chatId, setChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<PromptInputMessage | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isAddingAgents, setIsAddingAgents] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);

  // Only fetch chat agents if we have a chatId
  const { addAgent } = useChatAgents();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatId ? `/api/v1/chats/${chatId}` : "/api/v1/chats",
      }),
    [chatId]
  );

  const { messages, sendMessage, status, regenerate } = useChat({
    transport,
  });

  const handleSubmit = async (message: PromptInputMessage) => {
    // Parse mentions before submitting
    const parsed = parseMessageMentions(
      message.text || "",
      mentionEntities,
    );

    // You could validate mentions here
    console.log("Submitting with mentions:", parsed.agentIds);


    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    // If no chatId, create the chat first
    if (!chatId) {
      try {
        const created = await createChat({
          title: message.text?.slice(0, 80) || "New Chat",
        });
        setChatId(created.chat.id);
        setPendingMessage(message);

        // If agents are selected, we'll add them after chat creation
        return;
      } catch (e) {
        console.error(e);
        alert("Failed to create chat. Please try again.");
        return;
      }
    }

    // Chat already exists; send immediately
    sendMessage({
      text: message.text || "Sent with attachments",
      files: message.files,
    });
    setInput("");
  };

  // After chatId is set, add agents and send the deferred message
  useEffect(() => {
    if (!chatId || !pendingMessage) return;

    const addAgentsAndSendMessage = async () => {
      // Add selected agents first if any
      if (selectedAgentIds.length > 0) {
        setIsAddingAgents(true);
        try {
          for (let i = 0; i < selectedAgentIds.length; i++) {
            await addAgent({
              agentId: selectedAgentIds[i],
              speakOrder: i,
            });
          }
          setSelectedAgentIds([]);
        } catch (error) {
          console.error("Failed to add agents:", error);
          alert("Failed to add agents to chat.");
          setIsAddingAgents(false);
          return;
        }
        setIsAddingAgents(false);
      }

      // Now send the message
      sendMessage({
        text: pendingMessage.text || "Sent with attachments",
        files: pendingMessage.files,
      });
      setPendingMessage(null);
    };

    addAgentsAndSendMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const handleAgentSelection = (agentIds: string[]) => {
    setSelectedAgentIds(agentIds);
  };

  const selectedAgents = selectedAgentIds
    .map((id) => allAgents.find((a) => a.id === id))
    .filter(Boolean);

  const mentionEntities = useMemo<MentionEntity[]>(
    () => [
      ...allAgents.map((a) => ({
        id: a.id,
        name: a.name,
        type: "agent" as const,
      })),
    ],
    [allAgents],
  );

  const {
    selectedMentions,
    addMention,
    removeMention,
    clearMentions,
    getMentionIds,
  } = useMentionInput(mentionEntities);

  const handleMentionSelect = useCallback(
    (mention: MentionEntity) => {
      addMention(mention);
    },
    [addMention],
  );

  // Navigate to full chat page after first message is sent
  useEffect(() => {
    if (chatId && messages.length > 0 && !isAddingAgents) {
      // Optional: Redirect to the full chat page after starting conversation
      // router.push(`/chats/${chatId}`);
    }
  }, [chatId, messages.length, isAddingAgents, router]);

  return (
    <div className="relative mx-auto size-full h-screen max-w-4xl p-6">
      <div className="flex h-full flex-col">
        {/* Header with Agent Selection Toggle */}
        {messages.length === 0 && !isLoadingAgents && allAgents.length > 0 && (
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => setShowAgentSelector(!showAgentSelector)}
              className="w-full"
            >
              <Users className="h-4 w-4 mr-2" />
              {showAgentSelector ? "Hide" : "Select"} Agents
              {selectedAgentIds.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedAgentIds.length}
                </Badge>
              )}
            </Button>
          </div>
        )}

        {/* Agent Selector - Show before first message */}
        {showAgentSelector && messages.length === 0 && (
          <Card className="mb-4 p-4 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Select Agents for Conversation</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAgentSelector(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <AgentSelector
              availableAgents={allAgents}
              selectedAgentIds={selectedAgentIds}
              onSelectionChange={handleAgentSelection}
              isLoading={isLoadingAgents}
            />
          </Card>
        )}

        {/* Selected Agents Preview - Compact */}
        {selectedAgentIds.length > 0 && messages.length === 0 && !showAgentSelector && (
          <Card className="mb-4 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Selected:</span>
              {selectedAgents.map((agent, idx) => (
                <Badge key={agent.id} variant="secondary" className="gap-1">
                  <div
                    className="h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-white font-semibold"
                    style={{ backgroundColor: agent.color || "#3B82F6" }}
                  >
                    {idx + 1}
                  </div>
                  {agent.name}
                  <button
                    onClick={() =>
                      setSelectedAgentIds(selectedAgentIds.filter((id) => id !== agent.id))
                    }
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAgentSelector(true)}
              >
                Edit
              </Button>
            </div>
          </Card>
        )}

        {/* Main Conversation Area */}
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 && !showAgentSelector && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="max-w-md space-y-4">
                  <h2 className="text-2xl font-bold">Welcome to AI Chat</h2>
                  <p className="text-muted-foreground">
                    {allAgents.length > 0 ? (
                      selectedAgentIds.length > 0 ? (
                        <>
                          You've selected {selectedAgentIds.length} agent
                          {selectedAgentIds.length !== 1 ? "s" : ""}. Type your message below to
                          start the conversation.
                        </>
                      ) : (
                        <>
                          Select agents above to enable multi-agent conversations, or just start
                          typing to chat with the default AI.
                        </>
                      )
                    ) : (
                      <>Start typing below to begin your conversation with AI.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "assistant" &&
                  message.parts.filter((part) => part.type === "source-url").length > 0 && (
                    <Sources>
                      <SourcesTrigger
                        count={message.parts.filter((part) => part.type === "source-url").length}
                      />
                      {message.parts
                        .filter((part) => part.type === "source-url")
                        .map((part, i) => (
                          <SourcesContent key={`${message.id}-${i}`}>
                            <Source key={`${message.id}-${i}`} href={part.url} title={part.url} />
                          </SourcesContent>
                        ))}
                    </Sources>
                  )}
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <Response>{part.text}</Response>
                            </MessageContent>
                          </Message>
                          {message.role === "assistant" &&
                            message.id === messages[messages.length - 1]?.id && (
                              <Actions className="mt-2">
                                <Action onClick={() => regenerate()} label="Retry">
                                  <RefreshCcwIcon className="size-3" />
                                </Action>
                                <Action
                                  onClick={() => navigator.clipboard.writeText(part.text)}
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </Action>
                              </Actions>
                            )}
                        </Fragment>
                      );
                    case "reasoning":
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-full"
                          isStreaming={
                            status === "streaming" &&
                            i === message.parts.length - 1 &&
                            message.id === messages.at(-1)?.id
                          }
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    default:
                      return null;
                  }
                })}
              </div>
            ))}
            {(status === "submitted" || isAddingAgents) && (
              <div className="flex items-center gap-2">
                <Loader />
                {isAddingAgents && (
                  <span className="text-sm text-muted-foreground">Setting up agents...</span>
                )}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Prompt Input */}
        <PromptInput
          onSubmit={handleSubmit}
          className="mt-4"
          globalDrop
          multiple
          mentions={{
            entities: mentionEntities,
            onMentionSelect: handleMentionSelect,
          }}
        >
          <PromptInputHeader>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextareaWithMentions
              placeholder={
                isAddingAgents
                  ? "Setting up agents..."
                  : selectedAgentIds.length > 0
                    ? `Chat with ${selectedAgentIds.length} agent${selectedAgentIds.length !== 1 ? "s" : ""}...`
                    : "Hello there, how can I assist you today?"
              }
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isAddingAgents}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <PromptInputButton
                variant={webSearch ? "default" : "ghost"}
                onClick={() => setWebSearch(!webSearch)}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputModelSelect onValueChange={(value) => setModel(value)} value={model}>
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.value} value={model.value}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={(!input && !status) || isAddingAgents} status={status} />
          </PromptInputFooter>
        </PromptInput>

        {/* Optional: Link to full chat after creation */}
        {chatId && messages.length > 0 && (
          <div className="mt-2 text-center">
            <Button
              variant="link"
              size="sm"
              onClick={() => router.push(`/chats/${chatId}`)}
            >
              Open in full chat view →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBotDemo;