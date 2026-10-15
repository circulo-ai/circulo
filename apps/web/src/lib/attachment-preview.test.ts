import { describe, expect, it } from "vitest";
import {
  getAttachmentPreviewKind,
  getAttachmentPreviewUrl,
  readInlinePreviewBytes,
  readPreviewBytes,
} from "./attachment-preview";

describe("attachment previews", () => {
  it.each([
    ["photo.JPG", "", "image"],
    ["recording.webm", "audio/webm", "audio"],
    ["clip.webm", "", "video"],
    ["notes", "text/plain; charset=utf-8", "text"],
    ["index.tsx", "application/octet-stream", "text"],
    ["index.ts", "video/mp2t", "text"],
    ["report.pdf", "", "pdf"],
    ["report.docx", "", "document"],
    ["book.xlsx", "", "spreadsheet"],
    ["table.csv", "text/csv", "spreadsheet"],
    ["archive.zip", "", "file"],
  ])("classifies %s (%s)", (name, type, kind) =>
    expect(getAttachmentPreviewKind(name, type)).toBe(kind),
  );

  it.each([
    "javascript:alert(1)",
    "file:///secret",
    "//unknown.example/file",
    "data:invalid",
  ])("rejects executable or invalid URLs: %s", (value) =>
    expect(getAttachmentPreviewUrl(value)).toBeUndefined(),
  );
  it.each([
    "/api/files/serve/example",
    "https://example.com/image.png",
    "blob:http://127.0.0.1:3310/example",
    "data:text/plain;base64,SGVsbG8=",
  ])("retains usable preview URLs: %s", (value) =>
    expect(getAttachmentPreviewUrl(value)).toBe(value),
  );

  it("preserves a complete file below the byte limit", async () => {
    const result = await readPreviewBytes(new Response("hello"), 10);
    expect(new TextDecoder().decode(result.bytes)).toBe("hello");
    expect(result.truncated).toBe(false);
  });
  it("truncates oversized text rather than buffering the entire file", async () => {
    const result = await readPreviewBytes(new Response("abcdefgh"), 4, true);
    expect(new TextDecoder().decode(result.bytes)).toBe("abcd");
    expect(result.truncated).toBe(true);
  });
  it("rejects oversized binary previews with or without a size header", async () => {
    await expect(readPreviewBytes(new Response("abcdefgh"), 4)).rejects.toThrow(
      "too large",
    );
    await expect(
      readPreviewBytes(
        new Response("abcd", { headers: { "content-length": "999" } }),
        4,
      ),
    ).rejects.toThrow("too large");
  });
  it("reports denied file access", async () => {
    await expect(
      readPreviewBytes(new Response(null, { status: 403 }), 10),
    ).rejects.toThrow("could not be loaded");
  });
  it("decodes local inline files without a network fetch", () => {
    expect(
      new TextDecoder().decode(
        readInlinePreviewBytes("data:text/plain;base64,SGVsbG8=", 10).bytes,
      ),
    ).toBe("Hello");
  });
  it("bounds inline text and rejects oversized office files", () => {
    const source = "data:text/plain;base64,YWJjZGVmZ2g=";
    const preview = readInlinePreviewBytes(source, 4, true);
    expect(new TextDecoder().decode(preview.bytes)).toBe("abcd");
    expect(preview.truncated).toBe(true);
    expect(() => readInlinePreviewBytes(source, 4)).toThrow("too large");
    expect(() =>
      readInlinePreviewBytes("data:text/plain;base64,@@@", 10),
    ).toThrow();
  });
});
