import type { VisibilityType } from "@/components/visibility-selector";

export async function deleteTrailingMessages({ id }: { id: string }) {
  const response = await fetch(
    `/api/messages/${encodeURIComponent(id)}/trailing`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    },
  );
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  throw new Error(payload?.message ?? "Unable to edit this message");
}

export async function editMessage({
  id,
  replacementId,
  content,
  parts,
  attachments,
}: {
  id: string;
  replacementId: string;
  content: string;
  parts?: unknown[];
  attachments?: unknown[];
}) {
  const response = await fetch(
    `/api/messages/${encodeURIComponent(id)}/edit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ replacementId, content, parts, attachments }),
    },
  );
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  throw new Error(payload?.message ?? "Unable to edit this message");
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
