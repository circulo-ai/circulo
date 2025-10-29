"use client";

import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { toast } from "sonner";
import { useState, useCallback } from "react";
import type { 
  ChatResponse, 
  SendMessageParams,
  MessagesResponse 
} from "./types";

export function useChat(chatId: string | null) {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<ChatResponse>(
    chatId ? `/api/v1/chats/${chatId}` : null,
    fetcher,
    {
      ...swrConfig,
      refreshInterval: 0, // Disable auto-refresh, we'll use streaming
    }
  );

  return {
    chat: data?.data,
    isLoading,
    error,
    mutate,
  };
}

export function useChatMessages(chatId: string | null) {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<MessagesResponse>(
    chatId ? `/api/v1/chats/${chatId}/messages` : null,
    fetcher,
    {
      ...swrConfig,
      refreshInterval: 0, // Use streaming for real-time updates
    }
  );

  return {
    messages: data?.data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useSendMessage(chatId: string | null) {
  const [isSending, setIsSending] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const sendMessage = useCallback(async (params: SendMessageParams) => {
    if (!chatId) {
      throw new Error("Chat ID is required");
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/v1/chats/${chatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          toast.error("Insufficient balance. Please add funds to your wallet.");
        } else {
          toast.error(result.error || "Failed to send message");
        }
        throw new Error(result.error || "Failed to send message");
      }

      if (result.data.warning) {
        toast.warning(result.data.warning);
      }

      // Store the run ID for streaming
      if (result.data.taskId) {
        setCurrentRunId(result.data.taskId);
      }

      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      if (!message.includes("Insufficient balance")) {
        toast.error(message);
      }
      throw error;
    } finally {
      setIsSending(false);
    }
  }, [chatId]);

  return {
    sendMessage,
    isSending,
    currentRunId,
    clearRunId: () => setCurrentRunId(null),
  };
}