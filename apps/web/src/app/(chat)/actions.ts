import type { VisibilityType } from "@/components/visibility-selector";

export async function deleteTrailingMessages({ id }: { id: string }) {
  await fetch(`/api/messages/${encodeURIComponent(id)}/trailing`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await fetch(`/api/chat/${encodeURIComponent(chatId)}/visibility`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ visibility }),
  });
}
