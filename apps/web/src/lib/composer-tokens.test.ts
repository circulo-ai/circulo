import { expandComposerCommand } from "@circulo-ai/types";
import { describe, expect, it } from "vitest";
import { tokenizeComposer } from "./composer-tokens";

describe("composer token decoration", () => {
  it("preserves text, whitespace, punctuation and email addresses", () => {
    const text =
      "hello a@b.com\n /summarize @agent:writer @tool:search @file:notes.md  ";
    const tokens = tokenizeComposer(text);
    expect(tokens.map((token) => token.text).join("")).toBe(text);
    expect(
      tokens.filter((token) => token.kind).map((token) => token.kind),
    ).toEqual(["command", "agent", "tool", "file"]);
  });
  it("resolves readable handles to their selected kind", () => {
    expect(
      tokenizeComposer("@notes", [
        {
          name: "Notes",
          username: "file:123",
          insertText: "notes",
          kind: "file",
        },
      ])[0]?.kind,
    ).toBe("file");
  });
  it("expands known commands without changing paths or unknown commands", () => {
    expect(expandComposerCommand("/plan ship a release")).toContain(
      "User request:\nship a release",
    );
    expect(expandComposerCommand("/usr/local/bin")).toBe("/usr/local/bin");
    expect(expandComposerCommand("/unknown test")).toBe("/unknown test");
  });
});
