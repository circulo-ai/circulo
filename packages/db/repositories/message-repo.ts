import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import type { DbInstance } from "../index";
import { chat, message, vote } from "../schema";

export type MessageAuthorType = "user" | "agent" | "system";

export interface MessageFilters {
  chatId: string;
  authorType?: MessageAuthorType;
  authorId?: string;
  includeDeleted?: boolean;
  before?: Date;
  after?: Date;
  limit?: number;
  offset?: number;
}

export function createMessageRepository(database: DbInstance) {
  const db = database;
  return {
    async findById(id: string) {
      return db.query.message.findFirst({ where: eq(message.id, id) });
    },

    async getById({ id }: { id: string }) {
      try {
        return await db.select().from(message).where(eq(message.id, id));
      } catch (_error) {
        throw new Error("Failed to get message by id");
      }
    },

    async findByIdWithVotes(id: string) {
      return db.query.message.findFirst({
        where: eq(message.id, id),
        with: { votes: true },
      });
    },

    async create(data: typeof message.$inferInsert) {
      const [row] = await db.insert(message).values(data).returning();
      return row;
    },

    async createMany(data: (typeof message.$inferInsert)[]) {
      const rows = await db.insert(message).values(data).returning();
      return rows;
    },

    async save({ messages }: { messages: (typeof message.$inferInsert)[] }) {
      try {
        return await db.insert(message).values(messages);
      } catch (_error) {
        throw new Error("Failed to save messages");
      }
    },

    async update(id: string, data: Partial<typeof message.$inferInsert>) {
      const [row] = await db
        .update(message)
        .set(data)
        .where(eq(message.id, id))
        .returning();
      return row;
    },

    async delete(id: string) {
      const [row] = await db
        .delete(message)
        .where(eq(message.id, id))
        .returning();
      return row;
    },

    // --- Soft Delete ---

    async softDelete(id: string) {
      const [row] = await db
        .update(message)
        .set({ isDeleted: true, deletedAt: new Date() })
        .where(eq(message.id, id))
        .returning();
      return row;
    },

    async restore(id: string) {
      const [row] = await db
        .update(message)
        .set({ isDeleted: false, deletedAt: null })
        .where(eq(message.id, id))
        .returning();
      return row;
    },

    // --- Edit ---

    async edit(id: string, content: string) {
      const [row] = await db
        .update(message)
        .set({ content, isEdited: true, editedAt: new Date() })
        .where(eq(message.id, id))
        .returning();
      return row;
    },

    // --- Query Methods ---

    async getByChatId({ id }: { id: string }) {
      try {
        return await db
          .select()
          .from(message)
          .where(eq(message.chatId, id))
          .orderBy(asc(message.createdAt));
      } catch (_error) {
        throw new Error("Failed to get messages by chat id");
      }
    },

    async findForChat(chatId: string, limit?: number) {
      return db.query.message.findMany({
        where: and(eq(message.chatId, chatId), eq(message.isDeleted, false)),
        orderBy: sql`created_at asc`,
        limit,
      });
    },

    async findLatestForChat(chatId: string, limit = 50) {
      return db.query.message.findMany({
        where: and(eq(message.chatId, chatId), eq(message.isDeleted, false)),
        orderBy: sql`created_at desc`,
        limit,
      });
    },

    async findMany(filters: MessageFilters) {
      const conditions = [eq(message.chatId, filters.chatId)];

      if (!filters.includeDeleted) {
        conditions.push(eq(message.isDeleted, false));
      }
      if (filters.authorType) {
        conditions.push(eq(message.authorType, filters.authorType));
      }
      if (filters.authorId) {
        conditions.push(eq(message.authorId, filters.authorId));
      }
      if (filters.before) {
        conditions.push(lt(message.createdAt, filters.before));
      }
      if (filters.after) {
        conditions.push(gt(message.createdAt, filters.after));
      }

      return db.query.message.findMany({
        where: and(...conditions),
        orderBy: desc(message.createdAt),
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      });
    },

    async findWorkflowMessage(chatId: string, workflowId: string) {
      const tracePart = JSON.stringify([
        { type: "data-workflowTrace", data: { workflowId } },
      ]);
      return db.query.message.findFirst({
        where: and(
          eq(message.chatId, chatId),
          eq(message.authorType, "agent"),
          eq(message.isDeleted, false),
          sql`${message.parts} @> ${tracePart}::jsonb`,
        ),
        orderBy: desc(message.createdAt),
      });
    },

    async findByAuthor(
      authorType: MessageAuthorType,
      authorId: string,
      opts?: { limit?: number },
    ) {
      return db.query.message.findMany({
        where: and(
          eq(message.authorType, authorType),
          eq(message.authorId, authorId),
          eq(message.isDeleted, false),
        ),
        orderBy: desc(message.createdAt),
        limit: opts?.limit ?? 50,
      });
    },

    async findRepliesTo(messageId: string) {
      return db.query.message.findMany({
        where: and(
          eq(message.quotedMessageId, messageId),
          eq(message.isDeleted, false),
        ),
        orderBy: sql`created_at asc`,
      });
    },

    // --- Pagination ---

    async findWithCursor(
      chatId: string,
      opts: { cursor?: string; limit?: number; direction?: "before" | "after" },
    ) {
      const limit = opts.limit ?? 50;
      const direction = opts.direction ?? "before";

      let cursorDate: Date | undefined;
      if (opts.cursor) {
        const cursorMsg = await this.findById(opts.cursor);
        cursorDate = cursorMsg?.createdAt;
      }

      const conditions = [
        eq(message.chatId, chatId),
        eq(message.isDeleted, false),
      ];

      if (cursorDate) {
        conditions.push(
          direction === "before"
            ? lt(message.createdAt, cursorDate)
            : gt(message.createdAt, cursorDate),
        );
      }

      const messages = await db.query.message.findMany({
        where: and(...conditions),
        orderBy:
          direction === "before"
            ? desc(message.createdAt)
            : sql`created_at asc`,
        limit: limit + 1,
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;

      return {
        items: direction === "before" ? items.reverse() : items,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      };
    },

    // --- Aggregations ---

    async countForChat(
      chatId: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<number> {
      const conditions = [eq(message.chatId, chatId)];
      if (!opts?.includeDeleted) {
        conditions.push(eq(message.isDeleted, false));
      }

      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(message)
        .where(and(...conditions));
      return result[0]?.count ?? 0;
    },

    async getCountByUserId({
      id,
      differenceInHours,
    }: {
      id: string;
      differenceInHours: number;
    }) {
      try {
        const timeAgo = new Date(
          Date.now() - differenceInHours * 60 * 60 * 1000,
        );

        const [stats] = await db
          .select({ count: count(message.id) })
          .from(message)
          .innerJoin(chat, eq(message.chatId, chat.id))
          .where(
            and(
              eq(chat.creatorId, id),
              gte(message.createdAt, timeAgo),
              eq(message.role, "user"),
            ),
          )
          .execute();

        return stats?.count ?? 0;
      } catch (_error) {
        throw new Error("Failed to get message count by user id");
      }
    },

    async getTotalTokensForChat(chatId: string): Promise<number> {
      const result = await db
        .select({ total: sql<number>`COALESCE(SUM(${message.tokenCount}), 0)` })
        .from(message)
        .where(eq(message.chatId, chatId));
      return result[0]?.total ?? 0;
    },

    async getTotalCostForChat(chatId: string): Promise<string> {
      const result = await db
        .select({ total: sql<string>`COALESCE(SUM(${message.cost}), 0)` })
        .from(message)
        .where(eq(message.chatId, chatId));
      return result[0]?.total ?? "0";
    },

    // --- Voting ---

    async vote({
      userId,
      chatId,
      messageId,
      type,
    }: {
      userId: string;
      chatId: string;
      messageId: string;
      type: "up" | "down";
    }) {
      try {
        const [existingVote] = await db
          .select()
          .from(vote)
          .where(and(eq(vote.messageId, messageId)));

        if (existingVote) {
          return await db
            .update(vote)
            .set({ isUpvoted: type === "up" })
            .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
        }
        return await db.insert(vote).values({
          userId,
          chatId,
          messageId,
          isUpvoted: type === "up",
        });
      } catch (_error) {
        throw new Error("Failed to vote message");
      }
    },

    // --- Cleanup ---

    async deleteForChat(chatId: string) {
      const result = await db
        .delete(message)
        .where(eq(message.chatId, chatId))
        .returning();
      return result.length;
    },

    async deleteByChatIdAfterTimestamp({
      chatId,
      timestamp,
    }: {
      chatId: string;
      timestamp: Date;
    }) {
      try {
        const messagesToDelete = await db
          .select({ id: message.id })
          .from(message)
          .where(
            and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
          );

        const messageIds = messagesToDelete.map((m) => m.id);

        if (messageIds.length > 0) {
          await db
            .delete(vote)
            .where(
              and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
            );

          return await db
            .delete(message)
            .where(
              and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
            );
        }
      } catch (_error) {
        throw new Error("Failed to delete messages by chat id after timestamp");
      }
    },

    async hardDeleteSoftDeleted(olderThanDays = 30) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const result = await db
        .delete(message)
        .where(and(eq(message.isDeleted, true), lt(message.deletedAt!, cutoff)))
        .returning();
      return result.length;
    },
  };
}
