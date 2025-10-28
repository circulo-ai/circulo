"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message as AIMessage, MessageAvatar, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
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
import type { Message } from "@/db/schema";
import { useChat } from "@/hooks/chat/use-chat";
import { cn } from "@/lib/utils";
import { MessageSquareIcon } from "lucide-react";
import { use, useState } from "react";
import type { UIMessage } from "ai";

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
            <div className="mx-auto max-w-4xl space-y-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              {streamingMessages.map((m) => (
                <StreamingMessageBubble key={m.id} message={m} />
              ))}
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = Boolean(message.userId);

  return (
    <AIMessage from={isUser ? "user" : "assistant"}>
      <MessageAvatar src="" name={isUser ? "You" : message.agentId ? `A${message.agentId}` : "AI"} />
      <MessageContent>
        <Response>{message.content}</Response>
        {!isUser && message.cost && Number(message.cost) > 0 && (
          <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
            <span>💰 ${Number(message.cost).toFixed(6)}</span>
            <span>•</span>
            <span>🪙 {message.tokenCount} tokens</span>
          </div>
        )}
      </MessageContent>
    </AIMessage>
  );
}

function StreamingMessageBubble({
  message,
}: {
  message: {
    id: string;
    agentId: string;
    uiMessages: UIMessage[];
  };
}) {
  return (
    <AIMessage from="assistant">
      <MessageAvatar src="" name={`A${message.agentId}`} />
      <MessageContent>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Loader size={10} />
            Typing
          </Badge>
        </div>

        <div className="mt-2 space-y-3">
          {message.uiMessages.map((ui, uiIdx) => (
            <div key={`${message.id}-ui-${uiIdx}`} className="space-y-3">
              {ui.parts.map((part, i) => {
                switch (part.type) {
                  case "text":
                    return (
                      <div
                        key={`${message.id}-text-${uiIdx}-${i}`}
                        className="bg-muted rounded-lg px-4 py-3"
                      >
                        <Response>{part.text}</Response>
                      </div>
                    );
                  case "tool-call": {
                    const toolName = part.toolName ?? "tool";
                    return (
                      <Tool
                        key={`${message.id}-tool-${uiIdx}-${i}`}
                        defaultOpen={false}
                      >
                        <ToolHeader
                          title={toolName}
                          type={`tool-${toolName}` as any}
                          state={"input-available"}
                        />
                        <ToolContent>
                          <ToolInput input={part.args} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  case "tool-result": {
                    const toolName = part.toolName ?? "tool";
                    return (
                      <Tool
                        key={`${message.id}-tool-result-${uiIdx}-${i}`}
                        defaultOpen={false}
                      >
                        <ToolHeader
                          title={`${toolName} result`}
                          type={`tool-${toolName}` as any}
                          state={"output-available"}
                        />
                        <ToolContent>
                          <ToolOutput output={part.result} errorText={undefined} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  default:
                    return null;
                }
              })}
            </div>
          ))}
        </div>
      </MessageContent>
    </AIMessage>
  );
}
