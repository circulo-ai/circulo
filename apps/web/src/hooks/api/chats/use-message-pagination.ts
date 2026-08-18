"use client";

import { getFetcher } from "@/lib/swr";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";

const MESSAGE_PAGE_SIZE = 50;
const fetchMessages = getFetcher();

export type ChatMessagePagination = {
  cursor?: string;
  hasMore: boolean;
};

type OlderMessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor?: string;
};

export function useMessagePagination({
  chatId,
  initialPagination,
  setMessages,
}: {
  chatId: string;
  initialPagination?: ChatMessagePagination;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialPagination?.hasMore ?? false);
  const cursorRef = useRef(initialPagination?.cursor);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    cursorRef.current = initialPagination?.cursor;
    hasMoreRef.current = initialPagination?.hasMore ?? false;
    setHasMore(initialPagination?.hasMore ?? false);
    setIsLoadingOlder(false);
    isLoadingRef.current = false;
  }, [chatId, initialPagination?.cursor, initialPagination?.hasMore]);

  const loadOlderMessages = useCallback(
    async (container: HTMLDivElement | null) => {
      const cursor = cursorRef.current;

      if (!cursor || !hasMoreRef.current || isLoadingRef.current) {
        return;
      }

      isLoadingRef.current = true;
      setIsLoadingOlder(true);

      const previousScrollHeight = container?.scrollHeight ?? 0;
      const previousScrollTop = container?.scrollTop ?? 0;

      try {
        const page = await fetchMessages<OlderMessagesResponse>(
          `/api/chat/${chatId}/messages?before=${encodeURIComponent(cursor)}&limit=${MESSAGE_PAGE_SIZE}`,
        );

        setMessages((currentMessages) => {
          const existingIds = new Set(
            currentMessages.map((message) => message.id),
          );
          const olderMessages = page.messages.filter(
            (message) => !existingIds.has(message.id),
          );

          return olderMessages.length > 0
            ? [...olderMessages, ...currentMessages]
            : currentMessages;
        });

        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!container?.isConnected) return;

            const addedHeight = container.scrollHeight - previousScrollHeight;
            container.scrollTop = previousScrollTop + addedHeight;
          });
        });
      } catch (error) {
        console.error("Failed to load older chat messages", error);
      } finally {
        isLoadingRef.current = false;
        setIsLoadingOlder(false);
      }
    },
    [chatId, setMessages],
  );

  return { hasMore, isLoadingOlder, loadOlderMessages };
}
