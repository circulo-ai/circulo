import {
  and,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { DbInstance } from "../index";
import {
  type Agent,
  chat,
  chatAgent,
  chatMember,
  type ChatVisibility,
  message,
  stream,
  vote,
} from "../schema";

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

export type ConversationSummary = {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread?: boolean;
  verified?: boolean;
  hasAttachment?: boolean;
  badges?: string[];
  type: "channel" | "dm";
};

export function createChatRepository(database: DbInstance) {
  const db = database;
  return {
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

    async save({
      id,
      userId,
      title,
      visibility,
      organizationId,
    }: {
      id: string;
      userId: string;
      title: string;
      visibility: ChatVisibility;
      organizationId: string;
    }) {
      try {
        return await db.transaction(async (tx) => {
          const [chatEntity] = await tx
            .insert(chat)
            .values({
              id,
              organizationId,
              creatorId: userId,
              title,
              visibility,
            })
            .returning({ id: chat.id });

          if (chatEntity) {
            await tx.insert(chatMember).values({
              chatId: chatEntity.id,
              userId: userId,
              canInvite: true,
              canManageKnowledge: true,
              notificationsEnabled: true,
              role: "owner",
            });
          } else {
            throw new Error("Could not create chat entity!");
          }

          return chatEntity;
        });
      } catch (_error) {
        throw new Error("Failed to save chat");
      }
    },

    async update(id: string, data: Partial<typeof chat.$inferInsert>) {
      const [row] = await db
        .update(chat)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(chat.id, id))
        .returning();
      return row;
    },

    async updateVisibilityById({
      chatId,
      visibility,
    }: {
      chatId: string;
      visibility: "private" | "public";
    }) {
      try {
        return await db
          .update(chat)
          .set({ visibility })
          .where(eq(chat.id, chatId));
      } catch (_error) {
        throw new Error("Failed to update chat visibility by id");
      }
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

    async deleteById({ id }: { id: string }) {
      try {
        await db.delete(vote).where(eq(vote.chatId, id));
        await db.delete(message).where(eq(message.chatId, id));
        await db.delete(stream).where(eq(stream.chatId, id));

        const [chatsDeleted] = await db
          .delete(chat)
          .where(eq(chat.id, id))
          .returning();
        return chatsDeleted;
      } catch (_error) {
        throw new Error("Failed to delete chat by id");
      }
    },

    async deleteAllByUserId({ userId }: { userId: string }) {
      try {
        const userChats = await db
          .select({ id: chat.id })
          .from(chat)
          .where(eq(chat.creatorId, userId));

        if (userChats.length === 0) {
          return { deletedCount: 0 };
        }

        const chatIds = userChats.map((c) => c.id);

        await db.delete(vote).where(inArray(vote.chatId, chatIds));
        await db.delete(message).where(inArray(message.chatId, chatIds));
        await db.delete(stream).where(inArray(stream.chatId, chatIds));

        const deletedChats = await db
          .delete(chat)
          .where(eq(chat.creatorId, userId))
          .returning();

        return { deletedCount: deletedChats.length };
      } catch (_error) {
        throw new Error("Failed to delete all chats by user id");
      }
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

    async getChatsByUserId({
      id,
      limit,
      startingAfter,
      endingBefore,
      search,
    }: {
      id: string;
      limit: number;
      startingAfter?: string;
      endingBefore?: string;
      search?: string;
    }) {
      try {
        const extendedLimit = limit + 1;

        const searchCondition = search
          ? or(
              ilike(chat.title, `%${search}%`),
              ilike(chat.description, `%${search}%`),
            )
          : undefined;

        const query = (whereCondition?: SQL<any>) => {
          const whereClause = searchCondition
            ? whereCondition
              ? and(eq(chat.creatorId, id), whereCondition, searchCondition)
              : and(eq(chat.creatorId, id), searchCondition)
            : whereCondition
              ? and(whereCondition, eq(chat.creatorId, id))
              : eq(chat.creatorId, id);

          return db
            .select()
            .from(chat)
            .where(whereClause)
            .orderBy(desc(chat.createdAt))
            .limit(extendedLimit);
        };

        let filteredChats: (typeof chat.$inferSelect)[] = [];

        if (startingAfter) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, startingAfter))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${startingAfter} not found`);
          }

          filteredChats = await query(
            gt(chat.createdAt, selectedChat.createdAt),
          );
        } else if (endingBefore) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, endingBefore))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${endingBefore} not found`);
          }

          filteredChats = await query(
            lt(chat.createdAt, selectedChat.createdAt),
          );
        } else {
          filteredChats = await query();
        }

        const hasMore = filteredChats.length > limit;

        return {
          chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
          hasMore,
        };
      } catch (_error) {
        throw new Error("Failed to get chats by user id");
      }
    },

    async getChatsByOrgId({
      id,
      limit,
      startingAfter,
      endingBefore,
      search,
    }: {
      id: string;
      limit: number;
      startingAfter?: string;
      endingBefore?: string;
      search?: string;
    }) {
      try {
        const extendedLimit = limit + 1;

        const searchCondition = search
          ? or(
              ilike(chat.title, `%${search}%`),
              ilike(chat.description, `%${search}%`),
            )
          : undefined;

        const query = (whereCondition?: SQL<any>) => {
          const whereClause = searchCondition
            ? whereCondition
              ? and(
                  eq(chat.organizationId, id),
                  whereCondition,
                  searchCondition,
                )
              : and(eq(chat.organizationId, id), searchCondition)
            : whereCondition
              ? and(whereCondition, eq(chat.organizationId, id))
              : eq(chat.organizationId, id);

          return db
            .select()
            .from(chat)
            .where(whereClause)
            .orderBy(desc(chat.createdAt))
            .limit(extendedLimit);
        };

        let filteredChats: (typeof chat.$inferSelect)[] = [];

        if (startingAfter) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, startingAfter))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${startingAfter} not found`);
          }

          filteredChats = await query(
            gt(chat.createdAt, selectedChat.createdAt),
          );
        } else if (endingBefore) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, endingBefore))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${endingBefore} not found`);
          }

          filteredChats = await query(
            lt(chat.createdAt, selectedChat.createdAt),
          );
        } else {
          filteredChats = await query();
        }

        const hasMore = filteredChats.length > limit;

        return {
          chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
          hasMore,
        };
      } catch (_error) {
        throw new Error("Failed to get chats by org id");
      }
    },

    async getConversationSummariesByUserId({
      id,
      limit,
      startingAfter,
      endingBefore,
      search,
    }: {
      id: string;
      limit: number;
      startingAfter?: string;
      endingBefore?: string;
      search?: string;
    }): Promise<{ conversations: ConversationSummary[]; hasMore: boolean }> {
      try {
        const extendedLimit = limit + 1;

        const query = (whereCondition?: SQL<any>) =>
          db
            .select()
            .from(chat)
            .where(
              and(
                eq(chat.creatorId, id),
                eq(chat.isDeleted, false),
                ...(search?.trim()
                  ? [ilike(chat.title, `%${search.trim()}%`)]
                  : []),
                ...(whereCondition ? [whereCondition] : []),
              ),
            )
            .orderBy(desc(chat.createdAt))
            .limit(extendedLimit);

        let filteredChats: (typeof chat.$inferSelect)[] = [];

        if (startingAfter) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, startingAfter))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${startingAfter} not found`);
          }

          filteredChats = await query(
            gt(chat.createdAt, selectedChat.createdAt),
          );
        } else if (endingBefore) {
          const [selectedChat] = await db
            .select()
            .from(chat)
            .where(eq(chat.id, endingBefore))
            .limit(1);

          if (!selectedChat) {
            throw new Error(`Chat with id ${endingBefore} not found`);
          }

          filteredChats = await query(
            lt(chat.createdAt, selectedChat.createdAt),
          );
        } else {
          filteredChats = await query();
        }

        const hasMore = filteredChats.length > limit;
        const chatsPage = hasMore
          ? filteredChats.slice(0, limit)
          : filteredChats;

        const chatIds = chatsPage.map((c) => c.id);

        // Fetch latest message per chat
        const latestMessages = await db
          .select()
          .from(message)
          .where(inArray(message.chatId, chatIds))
          .orderBy(desc(message.createdAt));

        const latestByChat = new Map<string, typeof message.$inferSelect>();
        for (const m of latestMessages) {
          if (!latestByChat.has(m.chatId)) {
            latestByChat.set(m.chatId, m);
          }
        }

        // Fetch member unread counts
        const memberRows = await db
          .select({
            chatId: chatMember.chatId,
            unreadCount: chatMember.unreadCount,
          })
          .from(chatMember)
          .where(
            and(inArray(chatMember.chatId, chatIds), eq(chatMember.userId, id)),
          );
        const unreadByChat = new Map<string, number>();
        for (const row of memberRows) {
          unreadByChat.set(row.chatId, row.unreadCount ?? 0);
        }

        const conversations: ConversationSummary[] = chatsPage.map((c) => {
          const latest = latestByChat.get(c.id);
          const lastMessageText = latest?.content ?? "";
          const ts = latest?.createdAt ?? c.updatedAt ?? c.createdAt;
          const attachments = latest?.attachments as unknown as
            | any[]
            | Record<string, unknown>
            | undefined;
          const hasAttachment = Array.isArray(attachments)
            ? attachments.length > 0
            : attachments && Object.keys(attachments).length > 0;
          const unread = (unreadByChat.get(c.id) ?? 0) > 0;

          const badges: string[] = [];
          if (c.visibility === "public") badges.push("Public");
          if (c.type === "group") badges.push("Group");

          return {
            id: c.id,
            name: c.title,
            avatar: "",
            lastMessage: lastMessageText,
            timestamp: ts
              ? new Date(ts).toISOString()
              : new Date().toISOString(),
            unread,
            verified: c.visibility === "public",
            hasAttachment: Boolean(hasAttachment),
            badges,
            type: c.type === "group" ? "channel" : "dm",
          };
        });

        return { conversations, hasMore };
      } catch (_error) {
        throw new Error("Failed to get conversation summaries by user id");
      }
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
        .where(
          and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)),
        )
        .returning();
      return row;
    },

    async updateMemberRole(chatId: string, userId: string, role: string) {
      const [row] = await db
        .update(chatMember)
        .set({ role })
        .where(
          and(eq(chatMember.chatId, chatId), eq(chatMember.userId, userId)),
        )
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

    async getMemberRole(
      chatId: string,
      userId: string,
    ): Promise<string | null> {
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
          ? row.customTemperature
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
          customTemperature: update.customTemperature,
        })
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
        )
        .returning();
      return row;
    },

    async removeAgentFromChat(chatId: string, agentId: string) {
      const [row] = await db
        .delete(chatAgent)
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
        )
        .returning();
      return row;
    },

    async getAgentCount(chatId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatAgent)
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.isEnabled, true)),
        );
      return result[0]?.count ?? 0;
    },

    // --- Aggregations ---

    async countByOrganization(organizationId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(chat)
        .where(
          and(
            eq(chat.organizationId, organizationId),
            eq(chat.isDeleted, false),
          ),
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
}
