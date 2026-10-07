import { describe, expect, it } from "vitest";
import { isSafeMessageUrl } from "./message-url";

describe("message URL validation", () => {
  it("allows app paths and non-executable web/media URLs", () => {
    expect(isSafeMessageUrl("/api/files/serve/chat/file.txt")).toBe(true);
    expect(isSafeMessageUrl("https://example.com/source")).toBe(true);
    expect(isSafeMessageUrl("data:image/png;base64,AAAA")).toBe(true);
  });

  it("rejects executable and local-machine schemes", () => {
    expect(isSafeMessageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMessageUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeMessageUrl("//attacker.example/source")).toBe(false);
  });
});
