import type { ChatMessage } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { readChatAttachment } from "./read-chat-attachment";

describe("paginated chat attachment reads", () => {
  const source = "authorized content ".repeat(2000);
  const messages = [
    {
      id: "message",
      role: "user",
      parts: [
        {
          type: "file",
          filename: "source.txt",
          mediaType: "text/plain",
          url: `data:text/plain;base64,${Buffer.from(source).toString("base64")}`,
        },
      ],
    },
  ] as ChatMessage[];
  it("reads beyond the inline context cutoff and returns a continuation pointer", async () => {
    const reader = readChatAttachment(messages);
    const result = await reader.execute!(
      {
        filename: "source.txt",
        messageId: "message",
        offset: 20000,
        length: 1000,
      },
      { toolCallId: "read", messages: [], context: {} },
    );
    if (!("content" in result))
      throw new Error("Expected a completed file read");
    expect(result.content).toBe(source.slice(20000, 21000));
    expect(result.nextOffset).toBe(21000);
  });
  it("rejects files and message references outside the supplied authorized chat", async () => {
    const reader = readChatAttachment(messages);
    await expect(
      reader.execute!(
        {
          filename: "source.txt",
          messageId: "different-chat-message",
          offset: 0,
          length: 1000,
        },
        { toolCallId: "read", messages: [], context: {} },
      ),
    ).rejects.toThrow("not attached");
  });
});
