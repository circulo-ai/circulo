import { db } from "@/db";
import { Agent, chat, chatAgent } from "@/db/schema";
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

  async softDelete(id: string) {
    const [row] = await db
      .update(chat)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(chat.id, id))
      .returning();
    return row;
  },

  async hardDelete(id: string) {
    const [row] = await db.delete(chat).where(eq(chat.id, id)).returning();
    return row;
  },

  // --- Query Methods ---

  async findByOrganization(
    organizationId: string,
    opts?: {
      limit?: number;
      includeDeleted?: boolean;
    },
  ) {
    const conditions = [eq(chat.organizationId, organizationId)];
    if (!opts?.includeDeleted) {
      conditions.push(eq(chat.isDeleted, false));
    }

    return db.query.chat.findMany({
      where: and(...conditions),
      orderBy: sql`created_at desc`,
      limit: opts?.limit ?? 50,
    });
  },

  async findByCreator(
    userId: string,
    opts?: {
      limit?: number;
      includeDeleted?: boolean;
    ,
  ) {
    const conditions = [eq(chat.creatorId, userId)];
    if (!opts?.includeDeleted) {
      conditions.push(eq(chat.isDeleted, false));
    }

    return db.query.chat.findMany({
      where: and(...conditions),
      orderBy: sql`created_at
      desc`,
      limit: opts?.limit ?? 50
    });
  },

  // --- Agent Management ---

  async findAgentsForChat(
    chatId: string,
    opts?: {
      includeDisabled?: boolean;
      search?: string;
    }
  ) {
    const conditions = [eq(chatAgent.chatId, chatId)];
    if (!opts?.includeDisabled) {
      conditions.push(eq(chatAgent.isEnabled, true));
    }

    const rows = await db.query.chatAgent.findMany({
      where: and(...conditions),
      with: { agent: true },
    });

    let agents = rows.map((r) => r.agent);

    if (opts?.search) {
      const searchLower = opts.search.toLowerCase();
      agents = agents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          a.description?.toLowerCase().includes(searchLower)
      );
    }

    return agents;
  },

  async findAgentInChat(
    chatId: string,
    agentId: string
  ): Promise<Agent | undefined> {
    const row = await db.query.chatAgent.findFirst({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId),
        eq(chatAgent.isEnabled, true)
      ),
      with: { agent: true }
    });

    if (!row?.agent) return undefined;

    // Merge chat-level overrides into agent
    return {
      ...row.agent,
      instructions: row.customInstructions ?? row.agent.instructions,
      temperature: row.customTemperature
        ? parseInt(row.customTemperature, 10)
        : row.agent.temperature
    } as Agent;
  },

  async addAgentToChat(chatId: string, agentId: string, addedBy: string) {
    const [row] = await db
      .insert(chatAgent)
      .values({ chatId, agentId, addedBy })
      .onConflictDoUpdate({
        target: [chatAgent.chatId, chatAgent.agentId],
        set: { isEnabled: true }
      })
      .returning();
    return row;
  },

  async updateAgentInChat(
    chatId: string,
    agentId: string,
    update: {
      isEnabled?: boolean;
      customInstructions?: string | null;
      customTemperature?: number | null;
    },
  ) {
    const [row] = await db
      .update(chatAgent)
      .set({
        isEnabled: update.isEnabled,
        customInstructions: update.customInstructions ?? undefined,
        customTemperature: update.customTemperature?.toString() ?? null
      })
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },

  async removeAgentFromChat(chatId: string, agentId: string) {
    const [row] = await db
      .delete(chatAgent)
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)))
      .returning();
    return row;
  },
};
