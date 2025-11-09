"use client";

import Link from "next/link";
import { useChats } from "@/hooks/use-chats";
import { useState } from "react";

export default function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { chats, isLoading, updateChatTitle, deleteChat } = useChats();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Your Chats</h2>
          <Link href="/chats" className="text-xs text-blue-600">New</Link>
        </div>
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        <ul className="space-y-2">
          {chats.map((c) => (
            <li key={c.id} className="group">
              {editingId === c.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className="flex-1 rounded border px-2 py-1 text-sm"
                    placeholder="Chat title"
                    disabled={saving}
                  />
                  <button
                    className="text-xs text-green-700 disabled:opacity-50"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const next = titleInput.trim() || c.title;
                        await updateChatTitle(c.id, next);
                        setEditingId(null);
                        setTitleInput("");
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                  >
                    Save
                  </button>
                  <button
                    className="text-xs text-gray-600"
                    onClick={() => {
                      setEditingId(null);
                      setTitleInput("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href={`/chats/${c.id}`}
                    className="flex-1 block text-sm hover:underline truncate"
                    title={c.title}
                  >
                    {c.title}
                  </Link>
                  <button
                    className="text-xs text-blue-700"
                    onClick={() => {
                      setEditingId(c.id);
                      setTitleInput(c.title ?? "");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs text-red-700 disabled:opacity-50"
                    onClick={async () => {
                      if (!confirm("Delete this chat? This cannot be undone.")) return;
                      setDeletingId(c.id);
                      try {
                        await deleteChat(c.id);
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    disabled={deletingId === c.id}
                  >
                    {deletingId === c.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </li>
          ))}
          {chats.length === 0 && !isLoading && (
            <li className="text-xs text-muted-foreground">No chats yet</li>
          )}
        </ul>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
