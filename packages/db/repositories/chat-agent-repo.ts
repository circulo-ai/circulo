import { db } from "@/db";
import { chatAgent } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export const chatAgentRepo = {
  async findById(id: string) {
    return db.query.chatAgent.findFirst({ where: eq(chatAgent.id, id) });
  },

  async findByIdWithAgent(id: string) {
    return db.query.chatAgent.findFirst({
      where: eq(chatAgent.id, id),
      with: { agent: true },
    });
  },

  async create(data: typeof chatAgent.$inferInsert) {
    const [row] = await db.insert(chatAgent).values(data).returning();
    return row;
  },

  async upsert(data: typeof chatAgent.$inferInsert) {
    const [row] = await db
      .insert(chatAgent)
      .values(data)
      .onConflictDoUpdate({
        target: [chatAgent.chatId, chatAgent.agentId],
        set: { isEnabled: true, customInstructions: data.customInstructions },
      })
      .returning();
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

  async deleteByChatAndAgent(chatId: string, agentId: string) {
    const [row] = await db
      .delete(chatAgent)
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  // --- Query Methods ---

  async findForChat(chatId: string, opts?: { includeDisabled?: boolean }) {
    const conditions = [eq(chatAgent.chatId, chatId)];
    if (!opts?.includeDisabled) {
      conditions.push(eq(chatAgent.isEnabled, true));
    }

    return db.query.chatAgent.findMany({
      where: and(...conditions),
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
    return db.query.chatAgent.findFirst({
      where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
      with: { agent: true },
    });
  },

  async findChatsForAgent(agentId: string, opts?: { enabledOnly?: boolean }) {
    const conditions = [eq(chatAgent.agentId, agentId)];
    if (opts?.enabledOnly) {
      conditions.push(eq(chatAgent.isEnabled, true));
    }

    return db.query.chatAgent.findMany({
      where: and(...conditions),
      with: { chat: true },
    });
  },

  // --- Status Management ---

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

  async enable(chatId: string, agentId: string) {
    const [row] = await db
      .update(chatAgent)
      .set({ isEnabled: true })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  async disable(chatId: string, agentId: string) {
    const [row] = await db
      .update(chatAgent)
      .set({ isEnabled: false })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  // --- Customization ---

  async updateCustomizations(
    chatId: string,
    agentId: string,
    data: {
      customInstructions?: string | null;
      customTemperature?: number | null;
    },
  ) {
    const [row] = await db
      .update(chatAgent)
      .set(data)
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  async clearCustomizations(chatId: string, agentId: string) {
    const [row] = await db
      .update(chatAgent)
      .set({ customInstructions: null, customTemperature: null })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  // --- Bulk Operations ---

  async addMultipleToChat(chatId: string, agentIds: string[], addedBy: string) {
    const values = agentIds.map((agentId) => ({ chatId, agentId, addedBy }));
    const rows = await db
      .insert(chatAgent)
      .values(values)
      .onConflictDoUpdate({
        target: [chatAgent.chatId, chatAgent.agentId],
        set: { isEnabled: true },
      })
      .returning();
    return rows;
  },

  async removeAllFromChat(chatId: string) {
    const result = await db
      .delete(chatAgent)
      .where(eq(chatAgent.chatId, chatId))
      .returning();
    return result.length;
  },

  async disableAllForChat(chatId: string) {
    const result = await db
      .update(chatAgent)
      .set({ isEnabled: false })
      .where(eq(chatAgent.chatId, chatId))
      .returning();
    return result.length;
  },

  // --- Checks & Counts ---

  async isAgentInChat(agentId: string, chatId: string): Promise<boolean> {
    const row = await db.query.chatAgent.findFirst({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId),
        eq(chatAgent.isEnabled, true),
      ),
    });
    return !!row;
  },

  async countForChat(
    chatId: string,
    opts?: { enabledOnly?: boolean },
  ): Promise<number> {
    const conditions = [eq(chatAgent.chatId, chatId)];
    if (opts?.enabledOnly) {
      conditions.push(eq(chatAgent.isEnabled, true));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatAgent)
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  },

  async countChatsForAgent(agentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatAgent)
      .where(
        and(eq(chatAgent.agentId, agentId), eq(chatAgent.isEnabled, true)),
      );
    return result[0]?.count ?? 0;
  },
};
