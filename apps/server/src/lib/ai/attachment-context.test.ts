import type { ChatMessage } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { normalizeAttachmentContext } from "./attachment-context";

function asMessage(parts: unknown[]): ChatMessage {
  return {
    id: "message-1",
    role: "user",
    parts: parts as ChatMessage["parts"],
  } as ChatMessage;
}

describe("attachment context normalization", () => {
  it("turns markdown data URLs into bounded text context", async () => {
    const source = "# Release notes\n\nAttachment parsing works.";
    const dataUrl = `data:text/markdown;base64,${Buffer.from(source).toString("base64")}`;

    const [message] = await normalizeAttachmentContext([
      asMessage([
        {
          type: "file",
          filename: "release-notes.md",
          mediaType: "text/markdown",
          url: dataUrl,
        },
      ]),
    ]);

    expect(message?.parts).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Attachment parsing works."),
      },
    ]);
    expect(message?.parts?.[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("release-notes.md"),
      }),
    );
  });

  it("keeps remote file references when the server cannot resolve them", async () => {
    const [message] = await normalizeAttachmentContext([
      asMessage([
        {
          type: "file",
          filename: "remote.pdf",
          mediaType: "application/pdf",
          url: "https://files.example.com/remote.pdf",
        },
      ]),
    ]);

    expect(message?.parts).toEqual([
      expect.objectContaining({
        type: "file",
        url: "https://files.example.com/remote.pdf",
      }),
    ]);
  });

  it("does not treat remote serve paths or query keys as local storage files", async () => {
    const [message] = await normalizeAttachmentContext([
      asMessage([
        {
          type: "file",
          filename: "remote.md",
          mediaType: "text/markdown",
          url: "https://attacker.example/api/files/serve/chat/other.md?key=secret.md",
        },
      ]),
    ]);

    expect(message?.parts).toEqual([
      expect.objectContaining({
        type: "file",
        url: "https://attacker.example/api/files/serve/chat/other.md?key=secret.md",
      }),
    ]);
  });
});
