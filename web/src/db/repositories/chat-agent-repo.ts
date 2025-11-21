import { chatAgent, db } from "@/db";
import { and, eq } from "drizzle-orm";

export const chatAgentRepo = {
  async findById(id: string) {
    return db.query.chatAgent.findFirst({ where: eq(chatAgent.id, id) });
  },

  async create(data: typeof chatAgent.$inferInsert) {
    const [row] = await db.insert(chatAgent).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof chatAgent.$inferInsert>) {
    const [row] = await db
      .update(chatAgent)
      .set(data)
      .where(eq(chatAgent.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db
      .delete(chatAgent)
      .where(eq(chatAgent.id, id))
      .returning();
    return row;
  },

  // --- Custom Methods ---

  async findForChat(chatId: string) {
    return db.query.chatAgent.findMany({
      where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
      with: { agent: true },
    });
  },

  async findForUserAndChat(userId: string, chatId: string) {
    return db.query.chatAgent.findMany({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.isEnabled, true),
        eq(chatAgent.addedBy, userId),
      ),
      with: { agent: true },
    });
  },

  async findEnabledForChat(chatId: string) {
    return db.query.chatAgent.findMany({
      where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
      with: { agent: true },
    });
  },

  async findAgentInChat(agentId: string, chatId: string) {
    return db.query.chatAgent.findMany({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId),
        eq(chatAgent.isEnabled, true),
      ),
      with: { agent: true },
    });
  },

  async toggleEnabled(chatId: string, agentId: string) {
    const current = await db.query.chatAgent.findFirst({
      where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
    });

    if (!current) return null;

    const [row] = await db
      .update(chatAgent)
      .set({ isEnabled: !current.isEnabled })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },
};
