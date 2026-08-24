import { describe, expect, it, vi } from "vitest";
import {
  createFileAccessToken,
  verifyFileAccessToken,
} from "./file-access-token";

describe("file access tokens", () => {
  it("signs a key for its storage context", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-api-secret-with-32-chars");
    const token = createFileAccessToken("chat/attachment.md", "chat");

    expect(verifyFileAccessToken("chat/attachment.md", "chat", token)).toBe(
      true,
    );
    expect(verifyFileAccessToken("chat/other.md", "chat", token)).toBe(false);
    expect(verifyFileAccessToken("chat/attachment.md", "general", token)).toBe(
      false,
    );
  });

  it("rejects missing and malformed tokens", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-api-secret-with-32-chars");

    expect(verifyFileAccessToken("chat/attachment.md", "chat", null)).toBe(
      false,
    );
    expect(
      verifyFileAccessToken("chat/attachment.md", "chat", "not-a-token"),
    ).toBe(false);
  });
});
