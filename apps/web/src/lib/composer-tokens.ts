import type { MentionChoice } from "./mention-picker";

export type ComposerToken = {
  text: string;
  kind?: "agent" | "tool" | "file" | "command";
};

/** Decoration only: retain every character, including whitespace and unfinished input. */
export function tokenizeComposer(
  text: string,
  choices: MentionChoice[] = [],
): ComposerToken[] {
  const tokens: ComposerToken[] = [];
  const pattern = /(^|[\s([{])(@[^\s@]+|\/[a-z][\w-]*)(?=$|\s|[),])/giu;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1].length;
    const value = match[2];
    if (start > offset) tokens.push({ text: text.slice(offset, start) });
    const choice = choices.find(
      (item) =>
        `@${item.insertText ?? item.username}`.toLowerCase() ===
        value.toLowerCase(),
    );
    const kind = value.startsWith("/")
      ? "command"
      : (choice?.kind ??
        (/^@(tool|mcp):/i.test(value)
          ? "tool"
          : /^@(file|attachment):/i.test(value)
            ? "file"
            : "agent"));
    tokens.push({ text: value, kind });
    offset = start + value.length;
  }
  if (offset < text.length) tokens.push({ text: text.slice(offset) });
  return tokens;
}
