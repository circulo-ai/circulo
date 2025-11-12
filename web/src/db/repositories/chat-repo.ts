import { chat, db, chatAgent } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const chatRepoFactory = makeRepo(chat, (base) => ({
  findLatest(limit = 20) {
    return base.findMany({ orderBy: sql`created_at desc`, limit });
  },
  findForUser(userId: string) {
    return base.findMany({ where: eq(chat.creatorId, userId) });
  },
  /**
   * Retrieve agents linked to a chat, ordered by speakOrder.
   * By default only returns enabled agents.
   */
  async findAgentsForChat(chatId: string, opts?: { includeDisabled?: boolean }) {
    const rows = await db.query.chatAgent.findMany({
      where: opts?.includeDisabled
        ? eq(chatAgent.chatId, chatId)
        : and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
      orderBy: (ca, { asc }) => [asc(ca.speakOrder)],
      with: { agent: true },
    });
    return rows.map((r) => r.agent);
  },
  /**
   * Get the next available speak order for a chat.
   * Returns max speak order + 1 or 0 if no agents.
   */
  async getNextSpeakOrder(chatId: string) {
    const result = await db.select({
      maxOrder: sql<number>`COALESCE(MAX(${chatAgent.speakOrder}), -1)::int`,
    })
    .from(chatAgent)
    .where(eq(chatAgent.chatId, chatId));
    return (result[0]?.maxOrder ?? -1) + 1;
  },
  /**
   * Update an agent's chat configuration.
   */
  async updateAgent(
    chatId: string,
    agentId: string,
    update: {
      speakOrder?: number;
      enabled?: boolean;
      customSystemPrompt?: string | null;
      customTemperature?: number | null;
    }
  ) {
    return db.update(chatAgent)
      .set({
        speakOrder: update.speakOrder,
        enabled: update.enabled,
        customSystemPrompt: update.customSystemPrompt ?? null,
        customTemperature: update.customTemperature ? String(update.customTemperature) : null,
      })
      .where(and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId)
      ))
      .returning();
  },
  /**
   * Remove an agent from a chat.
   */
  async removeAgent(chatId: string, agentId: string) {
    return db.delete(chatAgent)
      .where(and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId)
      ))
      .returning();
  }
}), { primaryKey: "id" });

export const chatRepo = chatRepoFactory.with(db);
export const useChatRepo = chatRepoFactory.with;
