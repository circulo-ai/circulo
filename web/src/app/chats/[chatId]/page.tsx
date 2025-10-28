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
import type { Message as DBMessage } from "@/db/schema";
import { useChat } from "@/hooks/chat/use-chat";
import type { UIMessage } from "ai";
import { MessageSquareIcon } from "lucide-react";
import { use, useCallback, useMemo, useState } from "react";

type PageProps = { params: Promise<{ chatId: string }> };

type MessagePart = {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
};

type RenderableMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  agentId?: string;
  createdAt?: Date;
};

export default function ChatPage({ params }: PageProps) {
  const { chatId } = use(params);
  const [sending, setSending] = useState(false);

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

  const onSubmit = useCallback(
    async (message: PromptInputMessage) => {
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
    },
    [sendMessage],
  );

  const status = useMemo(() => {
    if (sending || isSending) return "submitted";
    if (hasActiveStreaming) return "streaming";
    return "ready";
  }, [sending, isSending, hasActiveStreaming]);

  // Transform DB messages to renderable format
  const renderableMessages = useMemo((): RenderableMessage[] => {
    const dbMessages = messages
      .map((m: DBMessage) => {
        const uiMsg = m.uiMessage as UIMessage | null;
        if (!uiMsg) return null;

        return {
          id: m.id,
          role: uiMsg.role as "user" | "assistant",
          parts: (uiMsg.parts || []) as MessagePart[],
          agentId: m.agentId || undefined,
          createdAt: m.createdAt,
        };
      })
      .filter((m): m is RenderableMessage => m !== null);

    return dbMessages;
  }, [messages]);

  // Transform streaming messages to renderable format
  const renderableStreamingMessages = useMemo((): RenderableMessage[] => {
    return streamingMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      parts: (msg.parts || []) as MessagePart[],
      agentId: (msg as { agentId?: string }).agentId,
    }));
  }, [streamingMessages]);

  const allMessages = useMemo(
    () => [...renderableMessages, ...renderableStreamingMessages],
    [renderableMessages, renderableStreamingMessages],
  );

  const getDisplayName = useCallback((message: RenderableMessage): string => {
    if (message.role === "user") return "You";
    if (message.agentId) return `Agent ${message.agentId.slice(0, 4)}`;
    return "AI";
  }, []);

  const renderMessagePart = useCallback(
    (part: MessagePart, index: number, messageId: string) => {
      const partKey = `${messageId}-${part.type}-${index}`;

      if (part.type === "text") {
        return (
          <Response
            key={partKey}
            state={part.state as "streaming" | "done" | undefined}
          >
            {part.text || ""}
          </Response>
        );
      }

      // Handle tool parts
      return (
        <Tool key={partKey}>
          <ToolHeader
            title={part.type}
            type={part.type}
            state={
              part.state as
                | "input-available"
                | "output-available"
                | "output-error"
                | undefined
            }
          />
          <ToolContent>
            {"input" in part && part.input !== undefined && (
              <ToolInput input={part.input} />
            )}
            {(("output" in part && part.output !== undefined) ||
              ("errorText" in part && part.errorText !== undefined)) && (
              <ToolOutput
                output={part.output}
                errorText={part.errorText as string | undefined}
              />
            )}
          </ToolContent>
        </Tool>
      );
    },
    [],
  );

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
              <div className="text-destructive text-sm">{error}</div>
            </div>
          ) : allMessages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to begin chatting with the AI agents"
              icon={<MessageSquareIcon className="h-12 w-12" />}
            />
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 pb-6">
              {allMessages.map((message, index) => {
                const displayName = getDisplayName(message);
                const isStreaming = streamingMessages.some(
                  (sm) => sm.id === message.id,
                );
                const isUser = message.role === "user";

                return (
                  <Message from={message.role} key={`${message.id}-${index}`}>
                    <MessageAvatar src="" name={displayName} />
                    <MessageContent>
                      {message.parts.map((part, partIndex) =>
                        renderMessagePart(part, partIndex, message.id),
                      )}
                      {!isUser && isStreaming && (
                        <div className="text-muted-foreground mt-2 text-xs">
                          <Shimmer duration={1}>Typing…</Shimmer>
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                );
              })}
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
                disabled={hasActiveStreaming || sending || isSending}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {(sending || isSending) && (
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader size={12} />
                    Sending...
                  </div>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={status}
                disabled={hasActiveStreaming || sending || isSending}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
