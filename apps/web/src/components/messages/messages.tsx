"use client";

import { latestWorkflowTrace } from "@/lib/chat-streaming";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Greeting } from "@/components/greeting";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  useMessagePagination,
  type ChatMessagePagination,
} from "@/hooks/api/chats/use-message-pagination";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
import { useReducedMotion } from "framer-motion";
import { memo, useEffect, useMemo } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  chatId: string;
  initialMessagePagination?: ChatMessagePagination;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  canEditMessages: boolean;
  compact?: boolean;
};

function TranscriptControls({
  status,
  hasMore,
  isLoadingOlder,
  loadOlderMessages,
  reducedMotion,
}: {
  status: MessagesProps["status"];
  hasMore: boolean;
  isLoadingOlder: boolean;
  loadOlderMessages: (container: HTMLDivElement | null) => Promise<void>;
  reducedMotion: boolean;
}) {
  const { scrollRef, scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    const container = scrollRef.current;
    if (!(container instanceof HTMLDivElement)) return;
    const loadAtTop = () => {
      if (
        container.scrollHeight > container.clientHeight &&
        container.scrollTop <= 64
      ) {
        void loadOlderMessages(container);
      }
    };
    container.addEventListener("scroll", loadAtTop, { passive: true });
    return () => container.removeEventListener("scroll", loadAtTop);
  }, [scrollRef, loadOlderMessages]);

  useEffect(() => {
    if (status === "submitted")
      void scrollToBottom({ animation: reducedMotion ? "instant" : "smooth" });
  }, [status, reducedMotion, scrollToBottom]);

  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="ghost"
        size="sm"
        disabled={isLoadingOlder}
        onClick={() =>
          void loadOlderMessages(scrollRef.current as HTMLDivElement | null)
        }
      >
        {isLoadingOlder && <Spinner data-icon="inline-start" />}
        {isLoadingOlder ? "Loading older messages…" : "Load older messages"}
      </Button>
    </div>
  );
}

function PureMessages({
  chatId,
  initialMessagePagination,
  status,
  votes,
  messages,
  setMessages,
  sendMessage,
  isReadonly,
  canEditMessages,
  compact = false,
}: MessagesProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const { hasMore, isLoadingOlder, loadOlderMessages } = useMessagePagination({
    chatId,
    initialPagination: initialMessagePagination,
    setMessages,
  });
  const votesByMessage = useMemo(
    () => new Map(votes?.map((vote) => [vote.messageId, vote])),
    [votes],
  );

  const awaitingApproval =
    latestWorkflowTrace(messages.at(-1)?.parts ?? [])?.status === "paused";
  return (
    <Conversation
      key={chatId}
      className="h-full min-h-0 [&>div]:chat-scrollbar [&>div]:overflow-x-hidden [&>div]:overflow-y-auto [&>div]:overscroll-contain"
      initial="instant"
      resize={reducedMotion ? "instant" : "smooth"}
      aria-label="Chat messages"
    >
      <ConversationContent
        className={cn(
          "mx-auto max-w-4xl min-w-0 gap-4 px-2 pt-16 pb-4 md:gap-6 md:px-4 md:pt-20",
          compact && "gap-4 px-3 pt-4 md:gap-4 md:pt-4",
        )}
      >
        <TranscriptControls
          status={status}
          hasMore={hasMore}
          isLoadingOlder={isLoadingOlder}
          loadOlderMessages={loadOlderMessages}
          reducedMotion={reducedMotion}
        />
        {messages.length === 0 && <Greeting />}
        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            canEdit={canEditMessages}
            isLoading={
              !awaitingApproval &&
              status === "streaming" &&
              index === messages.length - 1
            }
            isReadonly={isReadonly}
            message={message}
            sendMessage={sendMessage}
            requiresScrollPadding={false}
            setMessages={setMessages}
            vote={votesByMessage.get(message.id)}
          />
        ))}
        {status === "submitted" && <ThinkingMessage />}
        {status === "streaming" && (
          <output className="flex items-center gap-2 text-xs text-muted-foreground">
            {!awaitingApproval && <Spinner />}
            {awaitingApproval ? "Waiting for approval" : "Responding…"}
          </output>
        )}
      </ConversationContent>
      <ConversationScrollButton
        aria-label="Jump to latest message"
        title="Jump to latest message"
      />
    </Conversation>
  );
}

// Message snapshots are immutable SDK updates. Avoid traversing the whole transcript on every token.
export const Messages = memo(PureMessages);
