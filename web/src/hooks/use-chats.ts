"use client";

import { useSWR, globalMutate } from "@/lib/swr";
import { type Chat } from "@/db/schema/chat";

export function useChats() {
  const { data, error, isLoading, mutate } = useSWR<{ chats: Chat[] }>(
    "/api/v1/chats"
  );

  const chats = data?.chats ?? [];

  async function createChat(payload?: {
    title?: string;
    description?: string;
    style?: Chat["style"];
    visibility?: Chat["visibility"];
  }) {
    const res = await fetch("/api/v1/chats/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to create chat");

    // Optimistically add to cache
    await mutate(
      (prev) => ({ chats: [json.chat, ...(prev?.chats ?? [])] }),
      { revalidate: false }
    );
    return json as { chat: Chat };
  }

  return {
    chats,
    isLoading,
    error,
    refresh: () => mutate(),
    createChat,
  };
}