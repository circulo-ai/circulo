import { chat, chatAgent, db } from "@/db";
import { and, eq, sql } from "drizzle-orm";

export const chatRepo = {
  async findById(id: string) {
    return db.query.chat.findFirst({ where: eq(chat.id, id) });
  },

  async create(data: typeof chat.$inferInsert) {
    const [row] = await db.insert(chat).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof chat.$inferInsert>) {
    const [row] = await db
      .update(chat)
      .set(data)
      .where(eq(chat.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db.delete(chat).where(eq(chat.id, id)).returning();
    return row;
  },

  // --- Custom Methods ---

  async findLatest(limit = 20) {
    return db.query.chat.findMany({
      orderBy: sql`created_at desc`,
      limit,
    });
  },

  async findForUser(userId: string) {
    return db.query.chat.findMany({
      where: eq(chat.creatorId, userId),
    });
  },

  /**
   * Retrieve agents linked to a chat
   * By default only returns enabled agents.
   */
  async findAgentsForChat(
    chatId: string,
    opts?: { includeDisabled?: boolean; search?: string },
  ) {
    const whereClause = opts?.includeDisabled
      ? eq(chatAgent.chatId, chatId)
      : and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true));

    const rows = await db.query.chatAgent.findMany({
      where: whereClause,
      with: { agent: true },
    });

    let agents = rows.map((r) => r.agent);

    // Apply search filter if provided
    if (opts?.search) {
      const searchLower = opts.search.toLowerCase();
      agents = agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(searchLower) ||
          agent.description?.toLowerCase().includes(searchLower),
      );
    }

    return agents;
  },

  /**
   * Update an agent's chat configuration.
   */
  async updateAgent(
    chatId: string,
    agentId: string,
    update: {
      enabled?: boolean;
      customSystemPrompt?: string | null;
      customTemperature?: number | null;
    },
  ) {
    const [updated] = await db
      .update(chatAgent)
      .set({
        enabled: update.enabled,
        customSystemPrompt: update.customSystemPrompt ?? undefined,
        customTemperature: update.customTemperature
          ? String(update.customTemperature)
          : null,
      })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return updated;
  },

  /**
   * Remove an agent from a chat.
   */
  async removeAgent(chatId: string, agentId: string) {
    const [deleted] = await db
      .delete(chatAgent)
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return deleted;
  },
};
