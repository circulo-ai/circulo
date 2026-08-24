import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { useDataStream } from "@/components/data-stream-provider";
import { Greeting } from "@/components/greeting";
import type { ChatMessagePagination } from "@/hooks/api/chats/use-message-pagination";
import { useMessagePagination } from "@/hooks/api/chats/use-message-pagination";
import { useMessages } from "@/hooks/api/chats/use-messages";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
import equal from "fast-deep-equal";
import { AnimatePresence } from "framer-motion";
import { ArrowDownIcon, Loader2 } from "lucide-react";
import { memo, useCallback, useEffect } from "react";
import { PreviewMessage, ThinkingMessage } from "./message";

function ActivityDots() {
  return (
    <span aria-hidden="true" className="flex items-end gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

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
};

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
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    initialScrollToBottom: true,
    storageKey: `chat-scroll:${chatId}:main`,
    status,
  });

  const { isLoadingOlder, loadOlderMessages } = useMessagePagination({
    chatId,
    initialPagination: initialMessagePagination,
    setMessages,
  });
  const isActivityInProgress = status === "submitted" || status === "streaming";

  const handleMessagesScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const container = event.currentTarget;
      if (container.scrollTop <= 64) {
        void loadOlderMessages(container);
      }
    },
    [loadOlderMessages],
  );

  useDataStream();

  useEffect(() => {
    if (status === "submitted") {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [scrollToBottom, status]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="overscroll-behavior-contain chat-scrollbar size-full touch-pan-y overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch]"
        onScroll={handleMessagesScroll}
        ref={messagesContainerRef}
        style={{ overflowAnchor: "none" }}
      >
        {isLoadingOlder && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Loading older messages</span>
          </div>
        )}

        <Conversation className="mx-auto flex max-w-4xl min-w-0 flex-col gap-4 md:gap-6">
          <ConversationContent className="flex flex-col gap-4 px-2 pt-16 pb-4 md:gap-6 md:px-4 md:pt-20">
            {messages.length === 0 && <Greeting />}

            {messages.map((message, index) => (
              <PreviewMessage
                key={message.id + index}
                chatId={chatId}
                canEdit={canEditMessages}
                isLoading={
                  status === "streaming" && messages.length - 1 === index
                }
                isReadonly={isReadonly}
                message={message}
                sendMessage={sendMessage}
                requiresScrollPadding={
                  hasSentMessage && index === messages.length - 1
                }
                setMessages={setMessages}
                vote={
                  votes
                    ? votes.find((vote) => vote.messageId === message.id)
                    : undefined
                }
              />
            ))}

            <AnimatePresence mode="wait">
              {status === "submitted" && <ThinkingMessage key="thinking" />}
            </AnimatePresence>

            <div className="min-h-6 min-w-6 shrink-0" ref={messagesEndRef} />
          </ConversationContent>
        </Conversation>
      </div>

      {!isAtBottom && (
        <button
          aria-label={
            isActivityInProgress
              ? "Scroll to latest activity"
              : "Scroll to bottom"
          }
          className="absolute bottom-4 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          {isActivityInProgress ? (
            <ActivityDots />
          ) : (
            <ArrowDownIcon className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.chatId !== nextProps.chatId) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages)) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }

  return (
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.canEditMessages === nextProps.canEditMessages &&
    prevProps.isArtifactVisible === nextProps.isArtifactVisible
  );
});
