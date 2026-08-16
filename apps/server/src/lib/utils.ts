import type { Document, Message } from "@/db/schema";
import type { ChatMessage } from "@/lib/types";
import type { UIMessage } from "ai";

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateRequestId(): string {
  return generateUUID();
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  if (!message.parts || message.parts.length === 0) {
    return (message as any).content ?? "";
  }
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

export function getTextFromMessages(
  messages: (ChatMessage | UIMessage)[],
): string {
  return messages
    .map((m) => {
      if (!m.parts || m.parts.length === 0) {
        return (m as any).content ?? "";
      }
      return m.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { type: "text"; text: string }).text)
        .join("");
    })
    .join("");
}

export function sanitizeText(text: string) {
  return text.replace("<has_function_call>", "");
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (index < 0 || index >= documents.length) {
    return new Date();
  }

  return documents[index]?.createdAt ?? new Date();
}

export function convertToUIMessages(messages: Message[]): ChatMessage[] {
  return messages
    .filter((msg) => !msg.isDeleted)
    .map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant" | "system",
      parts:
        Array.isArray(msg.parts) && msg.parts.length > 0
          ? (msg.parts as ChatMessage["parts"])
          : [
              {
                type: "text" as const,
                text: msg.content,
              },
            ],
      metadata: {
        createdAt: msg.createdAt.toISOString(),
      },
    }));
}

export function toQueryString<T extends Record<string, unknown>>(
  params: T,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    // Arrays become multiple key=value items
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined && v !== null && v !== "") {
          searchParams.append(key, String(v));
        }
      }
      continue;
    }

    searchParams.append(key, String(value));
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}
