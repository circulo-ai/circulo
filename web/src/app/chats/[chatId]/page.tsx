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
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/chat/use-chat";
import type { UIMessage } from "ai";
import {
  AlertCircleIcon,
  MessageSquareIcon,
  RefreshCwIcon,
} from "lucide-react";
import { memo, ReactNode, use, useCallback, useMemo } from "react";

type PageProps = { params: Promise<{ chatId: string }> };

type MessagePart = {
  type: string;
  text?: string;
  state?:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
  toolName?: string;
  [key: string]: unknown;
};

type RenderableMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  agentId?: string;
  createdAt?: Date;
};

const MemoizedMessage = memo(
  ({
    message,
    displayName,
    avatarColor,
    isStreaming,
    isUser,
    renderMessagePart,
  }: {
    message: RenderableMessage;
    displayName: string;
    avatarColor: string;
    isStreaming: boolean;
    isUser: boolean;
    renderMessagePart: (
      part: MessagePart,
      index: number,
      messageId: string,
    ) => ReactNode;
  }) => {
    return (
      <Message from={message.role}>
        <MessageAvatar src="" name={displayName} className={avatarColor} />
        <MessageContent>
          {message.parts.length > 0 ? (
            message.parts.map((part, partIndex) =>
              renderMessagePart(part, partIndex, message.id),
            )
          ) : isStreaming ? (
            <div className="flex items-center gap-2">
              <Shimmer duration={1}>Thinking...</Shimmer>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm italic">
              No content
            </div>
          )}

          {!isStreaming && message.createdAt && (
            <div className="text-muted-foreground/70 mt-2 text-xs">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </MessageContent>
      </Message>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.parts.length === nextProps.message.parts.length &&
      prevProps.isStreaming === nextProps.isStreaming &&
      JSON.stringify(prevProps.message.parts) ===
        JSON.stringify(nextProps.message.parts)
    );
  },
);

MemoizedMessage.displayName = "MemoizedMessage";

export default function ChatPage({ params }: PageProps) {
  const { chatId } = use(params);

  const {
    messages,
    streamingMessages,
    isLoading,
    error,
    sendMessage,
    isSending,
  } = useChat({
    chatId,
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const hasActiveStreaming = streamingMessages.length > 0;
  const isInputDisabled = hasActiveStreaming || isSending;

  const onSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text?.trim();
      if (!text || isInputDisabled) return;

      try {
        await sendMessage(text);
        // Input clears automatically via PromptInput component
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [sendMessage, isInputDisabled],
  );

  const status = useMemo(() => {
    if (isSending) return "submitted";
    if (hasActiveStreaming) return "streaming";
    return "ready";
  }, [isSending, hasActiveStreaming]);

  // // Transform DB messages to renderable format
  // const renderableMessages = useMemo((): RenderableMessage[] => {
  //   return messages
  //     .map((m: DBMessage) => {
  //       const uiMsg = m.uiMessage as UIMessage | null;
  //       if (!uiMsg) return null;

  //       return {
  //         id: m.id,
  //         role: uiMsg.role as "user" | "assistant",
  //         parts: (uiMsg.parts || []) as MessagePart[],
  //         agentId: m.agentId || undefined,
  //         createdAt: m.createdAt,
  //       };
  //     })
  //     .filter(Boolean) as RenderableMessage[];
  // }, [messages]);

  // // Transform streaming messages to renderable format
  // const renderableStreamingMessages = useMemo((): RenderableMessage[] => {
  //   return streamingMessages.map((msg) => ({
  //     id: msg.id,
  //     role: msg.role as "user" | "assistant",
  //     parts: (msg.parts || []) as MessagePart[],
  //     agentId: (msg as { agentId?: string }).agentId,
  //   }));
  // }, [streamingMessages]);

  // // Combine all messages in correct order
  // const allMessages = useMemo(() => {
  //   return [...renderableMessages, ...renderableStreamingMessages];
  // }, [renderableMessages, renderableStreamingMessages]);
  // Merge DB messages and streaming messages into one stable list
  // Merge DB messages and streaming messages into one stable list
  type RenderableMessage = {
    id: string;
    role: "user" | "assistant";
    parts: MessagePart[];
    agentId?: string;
    createdAt?: Date; // Keep optional
  };

  // ... inside your component
  const allMessages = useMemo((): RenderableMessage[] => {
    const messageMap = new Map<string, RenderableMessage>();

    // 1. First, add all persisted DB messages
    for (const m of messages) {
      const uiMsg = m.uiMessage as UIMessage | null;
      if (!uiMsg) continue;

      messageMap.set(m.id, {
        id: m.id,
        role: uiMsg.role as "user" | "assistant",
        parts: (uiMsg.parts || []) as MessagePart[],
        agentId: m.agentId || undefined,
        createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
      });
    }

    // 2. Then, overlay streaming messages
    for (const msg of streamingMessages) {
      // Get the persisted version if it exists
      const existing = messageMap.get(msg.id);

      // Create the renderable object, inheriting createdAt from the existing message
      const renderable: RenderableMessage = {
        id: msg.id,
        role: msg.role as "user" | "assistant",
        parts: (msg.parts || []) as MessagePart[],
        agentId: (msg as { agentId?: string }).agentId,
        // CRITICAL FIX: Retain the persisted message's createdAt if available
        createdAt: existing?.createdAt,
      };

      messageMap.set(msg.id, renderable);
    }

    // 3. Convert back to array and sort
    const result = Array.from(messageMap.values());

    // Sort: Use `createdAt` for everything, or place items without it at the end.
    result.sort((a, b) => {
      // If both have creation times (persisted or persisted-streaming-overlay)
      if (a.createdAt && b.createdAt) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }

      // If only 'a' has createdAt, 'a' comes first (-1)
      if (a.createdAt) return -1;

      // If only 'b' has createdAt, 'b' comes first (1)
      if (b.createdAt) return 1;

      // Both are pure streaming messages (without a matching persisted base).
      // Maintain their relative order based on how they entered the `streamingMessages` array.
      return 0;
    });

    return result;
  }, [messages, streamingMessages]);

  const getDisplayName = useCallback((message: RenderableMessage): string => {
    if (message.role === "user") return "You";
    if (message.agentId) {
      // You could fetch agent name from a context or props if needed
      return `Agent ${message.agentId.slice(0, 6)}`;
    }
    return "Assistant";
  }, []);

  const getAvatarColor = useCallback((message: RenderableMessage): string => {
    if (message.role === "user") return "bg-blue-500";
    if (message.agentId) {
      // Generate consistent color based on agent ID
      const colors = [
        "bg-purple-500",
        "bg-green-500",
        "bg-orange-500",
        "bg-pink-500",
        "bg-teal-500",
        "bg-indigo-500",
      ];
      const hash = message.agentId.split("").reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
      }, 0);
      return colors[Math.abs(hash) % colors.length];
    }
    return "bg-gray-500";
  }, []);

  const renderMessagePart = useCallback(
    (part: MessagePart, index: number, messageId: string) => {
      const partKey = `${messageId}-${part.type}-${index}`;

      // Handle text parts
      if (part.type === "text") {
        const text = part.text || "";
        if (!text.trim()) return null;
        return <Response key={partKey}>{text}</Response>;
      }

      // Handle tool parts - check for various tool-related types
      const isToolPart =
        part.type === "tool-input-available" ||
        part.type === "tool-output-available" ||
        part.type === "dynamic-tool" ||
        part.type.includes("tool");

      if (isToolPart) {
        const toolName = part.toolName || part.type.replace("tool-", "");
        const state = part.state || "input-available";

        return (
          <Tool key={partKey}>
            <ToolHeader title={toolName} type={part.type} state={state} />
            <ToolContent>
              {part.input !== undefined && <ToolInput input={part.input} />}
              {(part.output !== undefined || part.errorText !== undefined) && (
                <ToolOutput output={part.output} errorText={part.errorText} />
              )}
            </ToolContent>
          </Tool>
        );
      }

      // Unknown part type - render as JSON for debugging
      return (
        <div
          key={partKey}
          className="text-muted-foreground bg-muted rounded p-2 text-xs"
        >
          Unknown part type: {part.type}
        </div>
      );
    },
    [],
  );

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <MessageSquareIcon className="text-primary h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Roundtable Chat</h1>
              <p className="text-muted-foreground text-xs">
                Chat ID: {chatId.slice(0, 8)}...
              </p>
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

      {/* Main conversation area */}
      <Conversation>
        <ConversationContent>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader size={16} />
                Loading conversation...
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="bg-destructive/10 rounded-full p-3">
                    <AlertCircleIcon className="text-destructive h-8 w-8" />
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Connection Error
                  </h3>
                  <p className="text-muted-foreground mb-4 text-sm">{error}</p>
                  <Button onClick={handleRetry} variant="outline" size="sm">
                    <RefreshCwIcon className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          ) : allMessages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to begin your multi-agent roundtable discussion"
              icon={
                <div className="bg-primary/10 rounded-full p-4">
                  <MessageSquareIcon className="text-primary h-12 w-12" />
                </div>
              }
            />
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 px-4 pb-6">
              {allMessages.map((message) => {
                const displayName = getDisplayName(message);
                const avatarColor = getAvatarColor(message);
                const isStreaming = streamingMessages.some(
                  (sm) => sm.id === message.id,
                );
                const isUser = message.role === "user";

                return (
                  <MemoizedMessage
                    key={message.id}
                    message={message}
                    displayName={displayName}
                    avatarColor={avatarColor}
                    isStreaming={isStreaming}
                    isUser={isUser}
                    renderMessagePart={renderMessagePart}
                  />
                );
              })}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 border-t backdrop-blur">
        <div className="px-6 py-4">
          <div className="mx-auto max-w-4xl">
            <PromptInput
              onSubmit={onSubmit}
              className="bg-background rounded-lg border shadow-sm"
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder={
                    isInputDisabled
                      ? "Please wait for agents to finish..."
                      : "Type your message..."
                  }
                  className="max-h-[200px] min-h-[60px]"
                  disabled={isInputDisabled}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  {isSending && (
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Loader size={12} />
                      Sending message...
                    </div>
                  )}
                  {hasActiveStreaming && !isSending && (
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Loader size={12} />
                      Agents are thinking...
                    </div>
                  )}
                  {!isSending && !hasActiveStreaming && (
                    <div className="text-muted-foreground text-xs">
                      Press Enter to send, Shift+Enter for new line
                    </div>
                  )}
                </PromptInputTools>
                <PromptInputSubmit status={status} disabled={isInputDisabled} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
