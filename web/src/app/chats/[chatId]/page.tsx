"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
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
import { BotIcon, MessageSquareIcon, UserIcon } from "lucide-react";
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
    <div className={cn("flex gap-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className="bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
        {isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <BotIcon className="h-4 w-4" />
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser
              ? "You"
              : message.agentId
                ? `Agent ${message.agentId}`
                : "Assistant"}
          </span>
          <span className="text-muted-foreground text-xs">
            {new Date(message.createdAt).toLocaleTimeString()}
          </span>
        </div>

        <div
          className={cn(
            "rounded-lg px-4 py-3",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <Response>{message.content}</Response>
        </div>

        {!isUser && message.cost && Number(message.cost) > 0 && (
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span>💰 ${Number(message.cost).toFixed(6)}</span>
            <span>•</span>
            <span>🪙 {message.tokenCount} tokens</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingMessageBubble({
  message,
}: {
  message: {
    id: string;
    agentId: string;
    content: string;
    toolCalls: Array<{ id: string; name: string; args: any; result?: any }>;
  };
}) {
  return (
    <div className="flex gap-4">
      <div className="bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
        <BotIcon className="h-4 w-4" />
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Agent {message.agentId}</span>
          <Badge variant="secondary" className="gap-1.5">
            <Loader size={10} />
            Typing
          </Badge>
        </div>

        {message.content ? (
          <div className="bg-muted rounded-lg px-4 py-3">
            <Response>{message.content}</Response>
          </div>
        ) : (
          <div className="bg-muted rounded-lg px-4 py-3">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader size={14} />
              Thinking...
            </div>
          </div>
        )}

        {message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((tc) => (
              <Tool key={tc.id} defaultOpen={false}>
                <ToolHeader
                  title={tc.name}
                  type={`tool-${tc.name}` as any}
                  state={tc.result ? "output-available" : "input-available"}
                />
                <ToolContent>
                  <ToolInput input={tc.args} />
                  {tc.result && (
                    <ToolOutput output={tc.result} errorText={undefined} />
                  )}
                </ToolContent>
              </Tool>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
