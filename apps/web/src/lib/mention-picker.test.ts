import { describe, expect, it } from "vitest";
import {
  filterMentionChoices,
  getCommandRange,
  getMentionRange,
  insertMention,
  moveMentionIndex,
  resolvePromptMentions,
} from "./mention-picker";
import { extractPromptMentions } from "./prompt-mentions";

describe("composer mentions", () => {
  it("offers commands only at the leading command interpreted by the backend", () => {
    expect(getCommandRange("  /plan", 7)?.query).toBe("plan");
    expect(getCommandRange("Context\n/plan", 13)).toBeNull();
    expect(getCommandRange("\n/plan", 6)?.query).toBe("plan");
  });
  it("opens at a caret mention and ignores email addresses or selected text", () => {
    expect(getMentionRange("Ask @res", 8)).toEqual({
      start: 4,
      end: 8,
      query: "res",
    });
    expect(getMentionRange("mail@example.com", 16)).toBeNull();
    expect(getMentionRange("@research", 5, 8)).toBeNull();
    expect(getMentionRange("hello @", 7)).toEqual({
      start: 6,
      end: 7,
      query: "",
    });
  });
  it("replaces a mention in the middle while preserving surrounding text", () => {
    const text = "Ask @research then summarize";
    const range = getMentionRange(text, 8)!;
    expect(
      insertMention(text, range, {
        name: "Research",
        username: "id",
        insertText: "research-lead",
      }),
    ).toEqual({ value: "Ask @research-lead then summarize", cursor: 18 });
  });
  it.each([
    [0, "ArrowUp", 3, 2],
    [2, "ArrowDown", 3, 0],
    [1, "Home", 8, 0],
    [1, "End", 8, 7],
    [1, "PageDown", 8, 6],
    [6, "PageUp", 8, 1],
    [0, "ArrowDown", 0, -1],
  ])("moves %s with %s across %s rows", (index, key, count, expected) => {
    expect(moveMentionIndex(Number(index), String(key), Number(count))).toBe(
      expected,
    );
  });
  const choices = [
    {
      kind: "agent" as const,
      name: "Research lead",
      username: "agent-uuid",
      insertText: "research-lead",
    },
    {
      kind: "tool" as const,
      name: "Create document",
      username: "tool:createDocument",
      insertText: "tool:createDocument",
      description: "Document authoring",
    },
    {
      kind: "file" as const,
      name: "Project notes.md",
      username: "file:message-uuid:0",
      insertText: "file:project-notes.md",
    },
  ];
  it("filters by category, display name, and tool provider", () => {
    expect(filterMentionChoices(choices, "tool:")).toEqual([choices[1]]);
    expect(filterMentionChoices(choices, "file:notes")).toEqual([choices[2]]);
    expect(filterMentionChoices(choices, "authoring")).toEqual([choices[1]]);
    expect(filterMentionChoices(choices, "agents")).toEqual([choices[0]]);
  });
  it("passes stable IDs and readable labels to the backend", () => {
    expect(
      resolvePromptMentions(
        "@research-lead @tool:createDocument @file:project-notes.md",
        choices,
      ),
    ).toEqual([
      { kind: "agent", key: "agent-uuid", label: "Research lead" },
      { kind: "tool", key: "createDocument", label: "Create document" },
      { kind: "file", key: "message-uuid:0", label: "Project notes.md" },
    ]);
  });
  it("deduplicates mentions and keeps files distinct from agents", () => {
    expect(
      extractPromptMentions(
        "me@example.com @file:report.pdf @file:report.pdf @tool:createDocument @agent:uuid",
      ),
    ).toEqual([
      { kind: "file", key: "report.pdf" },
      { kind: "tool", key: "createDocument" },
      { kind: "agent", key: "uuid" },
    ]);
  });
});
