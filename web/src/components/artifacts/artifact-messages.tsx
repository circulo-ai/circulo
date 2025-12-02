import { PreviewMessage, ThinkingMessage } from "@/components/messages/message";
import type { Vote } from "@/db/schema";
import { useMessages } from "@/hooks/api/chats/use-messages";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import type { UIArtifact } from "./artifact";

type ArtifactMessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  artifactStatus: UIArtifact["status"];
};

function PureArtifactMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
}: ArtifactMessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage,
  } = useMessages({
    status,
  });

  return (
    <div
      className="flex h-full flex-col items-center gap-4 overflow-y-scroll px-4 pt-20"
      ref={messagesContainerRef}
    >
      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id + index}
          chatId={chatId}
          isLoading={status === "streaming" && index === messages.length - 1}
          isReadonly={isReadonly}
          message={message}
          regenerate={regenerate}
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

      <motion.div
        className="min-h-6 min-w-6 shrink-0"
        onViewportEnter={onViewportEnter}
        onViewportLeave={onViewportLeave}
        ref={messagesEndRef}
      />
    </div>
  );
}

function areEqual(
  prevProps: ArtifactMessagesProps,
  nextProps: ArtifactMessagesProps,
) {
  if (
    prevProps.artifactStatus === "streaming" &&
    nextProps.artifactStatus === "streaming"
  ) {
    return true;
  }

  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.status && nextProps.status) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }

  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
