"use client";

import { useSWR, globalMutate } from "@/lib/swr";
import { type Chat } from "@/db/schema/chat";

export function useChats() {
  const { data, error, isLoading, mutate } = useSWR<{ data: { chats: Chat[] } }>(
    "/api/v1/chats"
  );

  const chats = data?.data?.chats ?? [];

  async function createChat(payload?: {
    title?: string;
    description?: string;
    style?: Chat["style"];
    visibility?: Chat["visibility"];
  }) {
    const res = await fetch("/api/v1/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      console.error("Create chat error:", json);
      throw new Error(json?.error || json?.message || "Failed to create chat");
    }

    const json = await res.json();

    // Optimistically add to cache
    await mutate(
      (prev) => ({ data: { chats: [json.data.chat, ...(prev?.data?.chats ?? [])] } }),
      { revalidate: false }
    );
    return json.data as { chat: Chat };
  }

  async function updateChatTitle(chatId: string, title: string) {
    const res = await fetch(`/api/v1/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && json.error) || "Failed to update chat");
    const updated = json?.data?.chat as Chat | undefined;

    await mutate(
      (prev) => {
        const prevChats = prev?.data?.chats ?? [];
        const nextChats = updated
          ? prevChats.map((c) => (c.id === chatId ? updated : c))
          : prevChats.map((c) => (c.id === chatId ? { ...c, title } : c));
        return { data: { chats: nextChats } };
      },
      { revalidate: false },
    );

    await globalMutate(
      `/api/v1/chats/${chatId}`,
      (prev: any) => {
        if (!prev?.data) return prev;
        return {
          data: {
            ...prev.data,
            chat: updated ?? { ...prev.data.chat, title },
          },
        };
      },
      false,
    );
    return updated ?? null;
  }

  async function deleteChat(chatId: string) {
    const res = await fetch(`/api/v1/chats/${chatId}`, { method: "DELETE" });
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    if (!res.ok && res.status !== 204)
      throw new Error((json && json.error) || "Failed to delete chat");

    await mutate(
      (prev) => {
        const prevChats = prev?.data?.chats ?? [];
        return { data: { chats: prevChats.filter((c) => c.id !== chatId) } };
      },
      { revalidate: false },
    );
    await globalMutate(`/api/v1/chats/${chatId}`, null, false);
  }

  return {
    chats,
    isLoading,
    error,
    refresh: () => mutate(),
    createChat,
    updateChatTitle,
    deleteChat,
  };
}
