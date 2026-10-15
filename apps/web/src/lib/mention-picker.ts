import { extractPromptMentions, type PromptMention } from "./prompt-mentions";

export type MentionRange = { start: number; end: number; query: string };
export type MentionChoice = {
  kind?: "agent" | "tool" | "file";
  name: string;
  username: string;
  insertText?: string;
  description?: string;
};

export function getMentionRange(
  value: string,
  cursor: number,
  selectionEnd = cursor,
): MentionRange | null {
  if (cursor !== selectionEnd) return null;
  const match = value.slice(0, cursor).match(/(?:^|[\s([{])@([^\s@]*)$/u);
  if (!match || match[1].length > 200) return null;
  return {
    start: cursor - match[1].length - 1,
    end: cursor + (value.slice(cursor).match(/^[^\s@]*/u)?.[0].length ?? 0),
    query: match[1],
  };
}

export function getCommandRange(
  value: string,
  cursor: number,
): MentionRange | null {
  const match = value.slice(0, cursor).match(/^\s*\/([\w-]*)$/u);
  if (!match) return null;
  return {
    start: cursor - match[1].length - 1,
    end: cursor + (value.slice(cursor).match(/^[\w-]*/u)?.[0].length ?? 0),
    query: match[1],
  };
}

export function moveMentionIndex(index: number, key: string, count: number) {
  if (!count) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "PageDown") return Math.min(count - 1, index + 5);
  if (key === "PageUp") return Math.max(0, index - 5);
  return (index + (key === "ArrowUp" ? -1 : 1) + count) % count;
}

export function insertMention(
  value: string,
  range: MentionRange,
  item: MentionChoice,
  prefix = "@",
) {
  const tail = value.slice(range.end);
  const insertion = `${prefix}${item.insertText ?? item.username}${/^\s/.test(tail) ? "" : " "}`;
  return {
    value: value.slice(0, range.start) + insertion + tail,
    cursor: range.start + insertion.length,
  };
}

export function filterMentionChoices<T extends MentionChoice>(
  items: T[],
  query: string,
): T[] {
  const scope = query.match(
    /^(agents?|tools?|mcp|files?|attachments?)(?::|\/|$)/i,
  );
  const kind = scope
    ? /^(tool|mcp)/i.test(scope[1])
      ? "tool"
      : /^(file|attachment)/i.test(scope[1])
        ? "file"
        : "agent"
    : undefined;
  const search = (scope ? query.slice(scope[0].length) : query).toLowerCase();
  return items.filter(
    (item) =>
      (!kind || item.kind === kind) &&
      `${item.name} ${item.username} ${item.description ?? ""}`
        .toLowerCase()
        .includes(search),
  );
}

/** Resolve readable handles to stable IDs without mistaking an email for a mention. */
export function resolvePromptMentions(
  text: string,
  items: MentionChoice[],
): PromptMention[] {
  return extractPromptMentions(text).map((mention) => {
    const token =
      mention.kind === "agent" ? mention.key : `${mention.kind}:${mention.key}`;
    const item = items.find(
      (choice) =>
        (choice.insertText ?? choice.username).toLowerCase() ===
        token.toLowerCase(),
    );
    return item
      ? {
          kind: item.kind ?? "agent",
          key: item.username.replace(/^(?:tool|file):/i, ""),
          label: item.name,
        }
      : mention;
  });
}
