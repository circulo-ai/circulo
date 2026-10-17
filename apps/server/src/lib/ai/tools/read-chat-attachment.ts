import { readAttachmentText } from "@/lib/ai/attachment-context";
import type { ChatMessage } from "@/lib/types";
import { tool, type Tool } from "ai";
import { z } from "zod";

export function readChatAttachment(messages: ChatMessage[]): Tool<
  {
    filename: string;
    messageId: string | null;
    offset: number;
    length: number;
  },
  {
    filename: string;
    messageId: string;
    content: string;
    totalCharacters: number;
    nextOffset: number | null;
  }
> {
  const files = messages.flatMap((message) =>
    message.parts
      .filter((part) => part.type === "file")
      .map((part) => ({ messageId: message.id, part })),
  );
  const cache = new Map<string, Promise<string>>();
  return tool({
    description: `Read extracted text from an attachment in this authorized conversation, in pages. Use it when inline file context was truncated. Available files: ${JSON.stringify(files.map(({ messageId, part }) => ({ messageId, filename: part.filename, mediaType: part.mediaType }))).slice(0, 12000)}`,
    inputSchema: z.object({
      filename: z.string().min(1).max(500),
      messageId: z.string().nullable(),
      offset: z.number().int().min(0).max(500000),
      length: z.number().int().min(256).max(8000),
    }),
    execute: async ({ filename, messageId, offset, length }) => {
      const match = [...files]
        .reverse()
        .find(
          (file) =>
            file.part.filename === filename &&
            (!messageId || file.messageId === messageId),
        );
      if (!match)
        throw new Error("That file is not attached to this conversation.");
      const key = `${match.messageId}:${match.part.url}`;
      if (!cache.has(key)) cache.set(key, readAttachmentText(match.part));
      const text = await cache.get(key)!;
      return {
        filename,
        messageId: match.messageId,
        content: text.slice(offset, offset + length),
        totalCharacters: text.length,
        nextOffset: offset + length < text.length ? offset + length : null,
      };
    },
  });
}
