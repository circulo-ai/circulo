import { db } from "@/db";
import { Agent, chat, chatAgent, chatMember } from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

export interface ChatFilters {
  organizationId?: string;
  creatorId?: string;
  type?: "direct" | "group";
  visibility?: "private" | "public";
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export const chatRepo = {
  async findById(id: string) {
    return db.query.chat.findFirst({ where: eq(chat.id, id) });
  },

  async findByIdWithRelations(id: string) {
    return db.query.chat.findFirst({
      where: eq(chat.id, id),
      with: {
        members: { with: { user: true } },
        agents: { with: { agent: true } },
        creator: true,
      },
    });
  },

  async create(data: typeof chat.$inferInsert) {
    const [row] = await db.insert(chat).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof chat.$inferInsert>) {
    const [row] = await db
      .update(chat)
      .set({ ...data, updatedAt: new Date() })
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

  async restore(id: string) {
    const [row] = await db
      .update(chat)
      .set({ isDeleted: false, deletedAt: null })
      .where(eq(chat.id, id))
      .returning();
    return row;
  },

  async hardDelete(id: string) {
    const [row] = await db.delete(chat).where(eq(chat.id, id)).returning();
    return row;
  },

  // --- Query Methods ---

  async findMany(filters: ChatFilters) {
    const conditions = [];

    if (filters.organizationId) {
      conditions.push(eq(chat.organizationId, filters.organizationId));
    }
    if (filters.creatorId) {
      conditions.push(eq(chat.creatorId, filters.creatorId));
    }
    if (filters.type) {
      conditions.push(eq(chat.type, filters.type));
    }
    if (filters.visibility) {
      conditions.push(eq(chat.visibility, filters.visibility));
    }
    if (!filters.includeDeleted) {
      conditions.push(eq(chat.isDeleted, false));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(chat.title, `%${filters.search}%`),
          ilike(chat.description, `%${filters.search}%`),
        )!,
      );
    }

    return db.query.chat.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(chat.createdAt),
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  },

  async findByOrganization(
    organizationId: string,
    opts?: { limit?: number; includeDeleted?: boolean },
  ) {
    const conditions = [eq(chat.organizationId, organizationId)];
    if (!opts?.includeDeleted) {
      conditions.push(eq(chat.isDeleted, false));
    }

    return db.query.chat.findMany({
      where: and(...conditions),
      orderBy: desc(chat.createdAt),
      limit: opts?.limit ?? 50,
    });
  },

  async findByCreator(
    userId: string,
    opts?: { limit?: number; includeDeleted?: boolean },
  ) {
    const conditions = [eq(chat.creatorId, userId)];
    if (!opts?.includeDeleted) {
      conditions.push(eq(chat.isDeleted, false));
    }

    return db.query.chat.findMany({
      where: and(...conditions),
      orderBy: desc(chat.createdAt),
      limit: opts?.limit ?? 50,
    });
  },

  async findPublicChats(organizationId: string, opts?: { limit?: number }) {
    return db.query.chat.findMany({
      where: and(
        eq(chat.organizationId, organizationId),
        eq(chat.visibility, "public"),
        eq(chat.isDeleted, false),
      ),
      orderBy: desc(chat.createdAt),
      limit: opts?.limit ?? 50,
    });
  },

  // --- Member Management ---

  async addMember(chatId: string, userId: string, role = "member") {
    const [row] = await db
      .insert(chatMember)
      .values({ chatId, userId, role })
      .onConflictDoUpdate({
        target: [chatMember.chatId, chatMember.userId],
        set: { leftAt: null, joinedAt: new Date(), role },
      })
      .returning();
    return row;
  },

  async removeMember(chatId: string, userId: string) {
    const [row] = await db
      .update(chatMember)
      .set({ leftAt: new Date() })
      .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)))
      .returning();
    return row;
  },

  async updateMemberRole(chatId: string, userId: string, role: string) {
    const [row] = await db
      .update(chatMember)
      .set({ role })
      .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)))
      .returning();
    return row;
  },

  async getMemberCount(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMember)
      .where(
        and(eq(chatMember.chatId, chatId), sql`${chatMember.leftAt} IS NULL`),
      );
    return result[0]?.count ?? 0;
  },

  async isMember(chatId: string, userId: string): Promise<boolean> {
    const member = await db.query.chatMember.findFirst({
      where: and(
        eq(chatMember.chatId, chatId),
        eq(chatMember.userId, userId),
        sql`${chatMember.leftAt} IS NULL`,
      ),
    });
    return !!member;
  },

  async getMemberRole(chatId: string, userId: string): Promise<string | null> {
    const member = await db.query.chatMember.findFirst({
      where: and(
        eq(chatMember.chatId, chatId),
        eq(chatMember.userId, userId),
        sql`${chatMember.leftAt} IS NULL`,
      ),
    });
    return member?.role ?? null;
  },

  // --- Agent Management ---

  async findAgentsForChat(
    chatId: string,
    opts?: { includeDisabled?: boolean; search?: string },
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
          a.description?.toLowerCase().includes(searchLower),
      );
    }

    return agents;
  },

  async findAgentInChat(
    chatId: string,
    agentId: string,
  ): Promise<Agent | undefined> {
    const row = await db.query.chatAgent.findFirst({
      where: and(
        eq(chatAgent.chatId, chatId),
        eq(chatAgent.agentId, agentId),
        eq(chatAgent.isEnabled, true),
      ),
      with: { agent: true },
    });

    if (!row?.agent) return undefined;

    return {
      ...row.agent,
      instructions: row.customInstructions ?? row.agent.instructions,
      temperature: row.customTemperature
        ? parseInt(row.customTemperature, 10)
        : row.agent.temperature,
    } as Agent;
  },

  async addAgentToChat(chatId: string, agentId: string, addedBy: string) {
    const [row] = await db
      .insert(chatAgent)
      .values({ chatId, agentId, addedBy })
      .onConflictDoUpdate({
        target: [chatAgent.chatId, chatAgent.agentId],
        set: { isEnabled: true },
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
        customTemperature: update.customTemperature?.toString() ?? null,
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

  async getAgentCount(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatAgent)
      .where(and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)));
    return result[0]?.count ?? 0;
  },

  // --- Aggregations ---

  async countByOrganization(organizationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chat)
      .where(
        and(eq(chat.organizationId, organizationId), eq(chat.isDeleted, false)),
      );
    return result[0]?.count ?? 0;
  },

  async countByCreator(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chat)
      .where(and(eq(chat.creatorId, userId), eq(chat.isDeleted, false)));
    return result[0]?.count ?? 0;
  },
};
