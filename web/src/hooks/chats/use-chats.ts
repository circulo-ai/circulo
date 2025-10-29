"use client";

import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { toast } from "sonner";
import { useState } from "react";
import type { 
  ChatListResponse, 
  CreateChatParams,
  SendMessageParams,
  MessagesResponse 
} from "./types";

interface UseChatsOptions {
  limit?: number;
  offset?: number;
}

export function useChats(options: UseChatsOptions = {}) {
  const { limit = 20, offset = 0 } = options;
  
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<ChatListResponse>(
    `/api/v1/chats?limit=${limit}&offset=${offset}`,
    fetcher,
    swrConfig
  );

  return {
    chats: data?.data || [],
    pagination: data?.pagination,
    isLoading,
    error,
    mutate,
  };
}

export function useCreateChat() {
  const [isCreating, setIsCreating] = useState(false);

  const createChat = async (params: CreateChatParams) => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/v1/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create chat");
      }

      toast.success("Chat created successfully");
      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create chat";
      toast.error(message);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createChat,
    isCreating,
  };
}

export function useDeleteChat() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteChat = async (chatId: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/chats/${chatId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete chat");
      }

      toast.success("Chat deleted successfully");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete chat";
      toast.error(message);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteChat,
    isDeleting,
  };
}