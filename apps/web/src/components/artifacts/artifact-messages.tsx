import { PreviewMessage, ThinkingMessage } from "@/components/messages/message";
import { useMessages } from "@/hooks/api/chats/use-messages";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
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
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  artifactStatus: UIArtifact["status"];
};

function PureArtifactMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  sendMessage,
  isReadonly,
}: ArtifactMessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage,
  } = useMessages({
    storageKey: `chat-scroll:${chatId}:artifact`,
    status,
  });

  return (
    <div
      className="chat-scrollbar min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4"
      ref={messagesContainerRef}
    >
      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id + index}
          chatId={chatId}
          canEdit={false}
          isLoading={status === "streaming" && index === messages.length - 1}
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
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.artifactStatus !== nextProps.artifactStatus) {
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

  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
