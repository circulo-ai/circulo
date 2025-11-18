import {
  createEntityLookup,
  extractRawMentions,
  Mention,
  MentionEntity,
  normalizeMentionName,
  ParsedMessage,
} from "@/lib/chat/mentions/types";
import { sql } from "drizzle-orm";

/**
 * Parse message content and resolve mentions to actual entities
 * This is the main backend function for processing incoming messages
 */
export function parseMessageMentions(
  content: string,
  availableEntities: MentionEntity[],
): ParsedMessage {
  const rawMentions = extractRawMentions(content);
  const entityLookup = createEntityLookup(availableEntities);

  const resolvedMentions: Mention[] = [];
  const agentIds = new Set<string>();
  const knowledgeBaseIds = new Set<string>();

  for (const raw of rawMentions) {
    const normalizedName = normalizeMentionName(raw.text);
    const lookupKey = `${raw.type}:${normalizedName}`;
    const entity = entityLookup.get(lookupKey);

    if (entity) {
      const mention: Mention = {
        type: raw.type,
        id: entity.id,
        name: entity.name,
        startIndex: raw.index,
        endIndex: raw.index + raw.text.length + 1, // +1 for @ or #
        raw: (raw.type === "agent" ? "@" : "#") + raw.text,
      };

      resolvedMentions.push(mention);

      if (raw.type === "agent") {
        agentIds.add(entity.id);
      } else {
        knowledgeBaseIds.add(entity.id);
      }
    }
  }

  return {
    content,
    mentions: resolvedMentions,
    agentIds: Array.from(agentIds),
    knowledgeBaseIds: Array.from(knowledgeBaseIds),
  };
}

/**
 * Validate that mentioned entities exist and user has access
 */
export async function validateMentions(
  agentIds: string[],
  knowledgeBaseIds: string[],
  userId: string,
  chatId: string,
  db: any, // Your database instance
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validate agents are in the chat
  if (agentIds.length > 0) {
    const chatAgents = await db
      .select()
      .from("chat_agent")
      .where({ chatId })
      .where(sql`agent_id = ANY(${agentIds})`);

    const validAgentIds = new Set(chatAgents.map((ca: any) => ca.agentId));
    const invalidAgents = agentIds.filter((id) => !validAgentIds.has(id));

    if (invalidAgents.length > 0) {
      errors.push(`Agents not in chat: ${invalidAgents.join(", ")}`);
    }
  }

  // Validate knowledge bases are accessible
  if (knowledgeBaseIds.length > 0) {
    const kbs = await db
      .select()
      .from("knowledge_base")
      .where(sql`id = ANY(${knowledgeBaseIds})`)
      .where(sql`user_id = ${userId} OR is_public = true`);

    const validKbIds = new Set(kbs.map((kb: any) => kb.id));
    const invalidKbs = knowledgeBaseIds.filter((id) => !validKbIds.has(id));

    if (invalidKbs.length > 0) {
      errors.push(`Knowledge bases not accessible: ${invalidKbs.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract mentions for database storage
 */
export function extractMentionsForStorage(parsed: ParsedMessage) {
  return {
    mentionedAgentIds: parsed.agentIds,
    mentionedKnowledgeBaseIds: parsed.knowledgeBaseIds,
  };
}
