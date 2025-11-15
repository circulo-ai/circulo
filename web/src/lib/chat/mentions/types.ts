export type MentionType = "agent" | "knowledge_base";

export interface Mention {
  type: MentionType;
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
  raw: string; // The original mention text, e.g., "@AgentName"
}

export interface ParsedMessage {
  content: string;
  mentions: Mention[];
  agentIds: string[];
  knowledgeBaseIds: string[];
}

export interface MentionEntity {
  id: string;
  name: string;
  type: MentionType;
}

/**
 * Regular expressions for matching mentions
 */
export const MENTION_PATTERNS = {
  agent: /@([a-zA-Z0-9_-]+)/g,
  knowledgeBase: /#([a-zA-Z0-9_-]+)/g,
  both: /([@#])([a-zA-Z0-9_-]+)/g,
} as const;

/**
 * Extract raw mention strings from text
 * Returns array of { type, text, index } for each mention found
 */
export function extractRawMentions(text: string): Array<{
  type: MentionType;
  text: string;
  index: number;
}> {
  const mentions: Array<{ type: MentionType; text: string; index: number }> =
    [];

  // Find all mentions
  const regex = new RegExp(MENTION_PATTERNS.both.source, "g");
  let match;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1];
    const name = match[2];
    mentions.push({
      type: prefix === "@" ? "agent" : "knowledge_base",
      text: name,
      index: match.index,
    });
  }

  return mentions;
}

/**
 * Normalize name for mention matching
 * Handles case-insensitivity and special characters
 */
export function normalizeMentionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/**
 * Create a lookup map from entities for fast mention resolution
 */
export function createEntityLookup(
  entities: MentionEntity[],
): Map<string, MentionEntity> {
  const lookup = new Map<string, MentionEntity>();

  for (const entity of entities) {
    const normalizedName = normalizeMentionName(entity.name);
    lookup.set(`${entity.type}:${normalizedName}`, entity);
  }

  return lookup;
}
