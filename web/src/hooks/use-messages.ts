"use client";

import { useSWR, globalMutate } from "@/lib/swr";
import { type Chat, type Message } from "@/db/schema/chat";

export function useMessages(chatId: string) {
  const { data, error, isLoading, mutate } = useSWR<{
    data: { chat: Chat; messages: Message[] };
  }>(`/api/v1/chats/${chatId}`);

  const chat = data?.data?.chat ?? null;
  const messages = data?.data?.messages ?? [];

  async function updateChatTitle(title: string) {
    const res = await fetch(`/api/v1/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && json.error) || "Failed to update chat");
    const updated = json?.data?.chat as Chat | undefined;
    await mutate((prev) => {
      if (!prev?.data) return prev;
      return { data: { ...prev.data, chat: updated ?? { ...prev.data.chat, title } } };
    }, { revalidate: false });
    // Also update the chats list sidebar if loaded
    await globalMutate("/api/v1/chats", (prev: any) => {
      const list = prev?.data?.chats ?? [];
      const next = updated
        ? list.map((c: Chat) => (c.id === chatId ? updated : c))
        : list.map((c: Chat) => (c.id === chatId ? { ...c, title } : c));
      return { data: { chats: next } };
    }, false);
    return updated ?? null;
  }

  async function deleteChat() {
    const res = await fetch(`/api/v1/chats/${chatId}`, { method: "DELETE" });
    let json: any = null;
    try { json = await res.json(); } catch {}
    if (!res.ok && res.status !== 204)
      throw new Error((json && json.error) || "Failed to delete chat");
    await mutate(undefined, { revalidate: false });
    await globalMutate("/api/v1/chats", (prev: any) => {
      const list = prev?.data?.chats ?? [];
      return { data: { chats: list.filter((c: Chat) => c.id !== chatId) } };
    }, false);
  }

  return {
    chat,
    messages,
    isLoading,
    error,
    refresh: () => mutate(),
    updateChatTitle,
    deleteChat,
  };
}