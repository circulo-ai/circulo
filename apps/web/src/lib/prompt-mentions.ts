export type PromptMention = {
  kind: "agent" | "tool";
  key: string;
  label?: string;
};

/** Extracts only composer-style mentions, ignoring ordinary email addresses. */
export function extractPromptMentions(text: string): PromptMention[] {
  const mentions: PromptMention[] = [];
  const seen = new Set<string>();
  const pattern = /(^|\s)@([^\s@]+)/g;

  for (const match of text.matchAll(pattern)) {
    const token = match[2]?.replace(/[.,!?;:]+$/, "");
    if (!token) continue;

    const toolMatch = token.match(/^(?:tool|mcp)[:/_-](.+)$/i);
    const mention: PromptMention = toolMatch
      ? { kind: "tool", key: toolMatch[1] ?? "" }
      : { kind: "agent", key: token };
    if (!mention.key) continue;

    const identity = `${mention.kind}:${mention.key.toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    mentions.push(mention);
  }

  return mentions.slice(0, 20);
}
