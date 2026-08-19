import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useState } from "react";

export function useMessages({
  status,
  initialScrollToBottom,
  storageKey,
}: {
  initialScrollToBottom?: boolean;
  status: UseChatHelpers<ChatMessage>["status"];
  storageKey?: string;
}) {
  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
  } = useScrollToBottom({ initialScrollToBottom, storageKey });

  const [hasSentMessage, setHasSentMessage] = useState(false);

  useEffect(() => {
    if (status === "submitted") {
      setHasSentMessage(true);
    }
  }, [status]);

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage,
  };
}
