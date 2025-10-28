"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/hooks/chat/use-chat";
import { MessageSquareIcon } from "lucide-react";
import { use, useState } from "react";

type PageProps = { params: Promise<{ chatId: string }> };

export default function ChatPage({ params }: PageProps) {
  const { chatId } = use(params);
  const { messages, streamingMessages, isLoading, error, sendMessage } =
    useChat(chatId);

  const [sending, setSending] = useState(false);

  const hasActiveStreaming = streamingMessages.length > 0;

  const onSubmit = async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text) return;

    setSending(true);
    try {
      await sendMessage(text);
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  const status = sending
    ? "submitted"
    : hasActiveStreaming
      ? "streaming"
      : "ready";

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquareIcon className="text-muted-foreground h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Roundtable Chat</h1>
              <p className="text-muted-foreground text-xs">Chat ID: {chatId}</p>
            </div>
          </div>
          {hasActiveStreaming && (
            <Badge variant="secondary" className="gap-2">
              <Loader size={12} />
              Agents responding...
            </Badge>
          )}
        </div>
      </header>

      <Conversation>
        <ConversationContent>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader size={16} />
                Loading messages...
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-destructive text-sm">
                Failed to load messages. Please refresh.
              </div>
            </div>
          ) : messages.length === 0 && streamingMessages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to begin chatting with the AI agents"
              icon={<MessageSquareIcon className="h-12 w-12" />}
            />
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 pb-6">
              {/* {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))} */}

              {messages.map((e, index) => {
                const message = e.uiMessage;
                if (!message) return null;
                const isUser = message.role === "user";
                const displayName = isUser
                  ? "You"
                  : e.agentId
                    ? `Agent ${String(e.agentId).slice(0, 4)}`
                    : "AI";

                const parts = Array.isArray(message.parts) ? message.parts : [];

                return (
                  <Message from={message.role} key={`${message.id}-${index}`}>
                    <MessageAvatar src="" name={displayName} />
                    <MessageContent>
                      {parts.map((part, i) => {
                        const partKey = `${message.id}-${part.type}-${i}`;
                        switch (part.type) {
                          case "text":
                            return (
                              <Response key={partKey}>
                                {(part as any).text}
                              </Response>
                            );
                          default:
                            if (
                              (part.type.startsWith("tool-") ||
                                part.type === "dynamic-tool") &&
                              "state" in part &&
                              "input" in part
                            ) {
                              const toolName =
                                part.type === "dynamic-tool"
                                  ? "toolName" in part
                                    ? (part as any).toolName
                                    : "Dynamic Tool"
                                  : part.type
                                      .replace("tool-", "")
                                      .split(/(?=[A-Z])/)
                                      .map(
                                        (word) =>
                                          word.charAt(0).toUpperCase() +
                                          word.slice(1),
                                      )
                                      .join(" ");

                              const toolPart = part as any;
                              const isKnowledgeBase =
                                toolName
                                  .toLowerCase()
                                  .includes("information") ||
                                toolName.toLowerCase().includes("knowledge");

                              return (
                                <Tool
                                  key={partKey}
                                  defaultOpen={
                                    toolPart.state === "output-available" &&
                                    isKnowledgeBase
                                  }
                                >
                                  <ToolHeader
                                    title={toolName}
                                    type={toolPart.type}
                                    state={toolPart.state}
                                  />
                                  <ToolContent>
                                    <ToolInput input={toolPart.input} />
                                    {(toolPart.state === "output-available" ||
                                      toolPart.state === "output-error") && (
                                      <ToolOutput
                                        output={toolPart.output}
                                        errorText={toolPart.errorText}
                                      />
                                    )}
                                  </ToolContent>
                                </Tool>
                              );
                            }
                            return null;
                        }
                      })}
                    </MessageContent>
                  </Message>
                );
              })}

              {streamingMessages.map((streams, index) =>
                streams.map((message) => {
                  const isUser = message.role === "user";
                  const displayName = isUser
                    ? "You"
                    : (message as any).agentId
                      ? `Agent ${String((message as any).agentId).slice(0, 4)}`
                      : "AI";

                  const parts = Array.isArray(message.parts)
                    ? message.parts
                    : [];

                  return (
                    <Message from={message.role} key={`${message.id}-${index}`}>
                      <MessageAvatar src="" name={displayName} />
                      <MessageContent>
                        {parts.map((part, i) => {
                          const partKey = `${message.id}-${part.type}-${i}`;
                          switch (part.type) {
                            case "text":
                              return (
                                <Response key={partKey}>
                                  {(part as any).text}
                                </Response>
                              );
                            default:
                              if (
                                (part.type.startsWith("tool-") ||
                                  part.type === "dynamic-tool") &&
                                "state" in part &&
                                "input" in part
                              ) {
                                const toolName =
                                  part.type === "dynamic-tool"
                                    ? "toolName" in part
                                      ? (part as any).toolName
                                      : "Dynamic Tool"
                                    : part.type
                                        .replace("tool-", "")
                                        .split(/(?=[A-Z])/)
                                        .map(
                                          (word) =>
                                            word.charAt(0).toUpperCase() +
                                            word.slice(1),
                                        )
                                        .join(" ");

                                const toolPart = part as any;
                                const isKnowledgeBase =
                                  toolName
                                    .toLowerCase()
                                    .includes("information") ||
                                  toolName.toLowerCase().includes("knowledge");

                                return (
                                  <Tool
                                    key={partKey}
                                    defaultOpen={
                                      toolPart.state === "output-available" &&
                                      isKnowledgeBase
                                    }
                                  >
                                    <ToolHeader
                                      title={toolName}
                                      type={toolPart.type}
                                      state={toolPart.state}
                                    />
                                    <ToolContent>
                                      <ToolInput input={toolPart.input} />
                                      {(toolPart.state === "output-available" ||
                                        toolPart.state === "output-error") && (
                                        <ToolOutput
                                          output={toolPart.output}
                                          errorText={toolPart.errorText}
                                        />
                                      )}
                                    </ToolContent>
                                  </Tool>
                                );
                              }
                              return null;
                          }
                        })}
                      </MessageContent>
                    </Message>
                  );
                }),
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <PromptInput
            onSubmit={onSubmit}
            className="bg-background rounded-lg border"
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Type your message..."
                className="min-h-[60px]"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {sending && (
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader size={12} />
                    Sending...
                  </div>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={status}
                disabled={hasActiveStreaming}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
