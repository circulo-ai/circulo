import { and, eq, sql } from "drizzle-orm";
import type { DbInstance } from "../index";
import { vote } from "../schema";

export function createVoteRepository(database: DbInstance) {
  const db = database;
  return {
    async findByUserAndMessage(
      userId: string,
      chatId: string,
      messageId: string,
    ) {
      return db.query.vote.findFirst({
        where: and(
          eq(vote.userId, userId),
          eq(vote.chatId, chatId),
          eq(vote.messageId, messageId),
        ),
      });
    },

    async upsert(data: typeof vote.$inferInsert) {
      const [row] = await db
        .insert(vote)
        .values(data)
        .onConflictDoUpdate({
          target: [vote.chatId, vote.messageId, vote.userId],
          set: { isUpvoted: data.isUpvoted },
        })
        .returning();
      return row;
    },

    async delete(userId: string, chatId: string, messageId: string) {
      const [row] = await db
        .delete(vote)
        .where(
          and(
            eq(vote.userId, userId),
            eq(vote.chatId, chatId),
            eq(vote.messageId, messageId),
          ),
        )
        .returning();
      return row;
    },

    // --- Query Methods ---

    async getByChatId({ id }: { id: string }) {
      try {
        return await db.select().from(vote).where(eq(vote.chatId, id));
      } catch (_error) {
        throw new Error("Failed to get votes by chat id");
      }
    },

    async findForMessage(chatId: string, messageId: string) {
      return db.query.vote.findMany({
        where: and(eq(vote.chatId, chatId), eq(vote.messageId, messageId)),
        with: { user: true },
      });
    },

    async findForChat(chatId: string) {
      return db.query.vote.findMany({
        where: eq(vote.chatId, chatId),
      });
    },

    async findByUser(userId: string, opts?: { chatId?: string }) {
      const conditions = [eq(vote.userId, userId)];
      if (opts?.chatId) {
        conditions.push(eq(vote.chatId, opts.chatId));
      }

      return db.query.vote.findMany({
        where: and(...conditions),
      });
    },

    // --- Vote Actions ---

    async vote(
      userId: string,
      chatId: string,
      messageId: string,
      type: "up" | "down",
    ) {
      return type == "up"
        ? this.upvote(userId, chatId, messageId)
        : this.downvote(userId, chatId, messageId);
    },

    async upvote(userId: string, chatId: string, messageId: string) {
      return this.upsert({ userId, chatId, messageId, isUpvoted: true });
    },

    async downvote(userId: string, chatId: string, messageId: string) {
      return this.upsert({ userId, chatId, messageId, isUpvoted: false });
    },

    async toggleVote(userId: string, chatId: string, messageId: string) {
      const existing = await this.findByUserAndMessage(
        userId,
        chatId,
        messageId,
      );
      if (existing) {
        return this.upsert({
          userId,
          chatId,
          messageId,
          isUpvoted: !existing.isUpvoted,
        });
      }
      return this.upvote(userId, chatId, messageId);
    },

    async removeVote(userId: string, chatId: string, messageId: string) {
      return this.delete(userId, chatId, messageId);
    },

    // --- Aggregations ---

    async getVoteCounts(chatId: string, messageId: string) {
      const result = await db
        .select({
          upvotes: sql<number>`COUNT(*) FILTER (WHERE ${vote.isUpvoted} = true)`,
          downvotes: sql<number>`COUNT(*) FILTER (WHERE ${vote.isUpvoted} = false)`,
        })
        .from(vote)
        .where(and(eq(vote.chatId, chatId), eq(vote.messageId, messageId)));

      return {
        upvotes: result[0]?.upvotes ?? 0,
        downvotes: result[0]?.downvotes ?? 0,
        total: (result[0]?.upvotes ?? 0) - (result[0]?.downvotes ?? 0),
      };
    },

    async getVoteCountsForMessages(chatId: string, messageIds: string[]) {
      if (messageIds.length === 0) return {};

      const results = await db
        .select({
          messageId: vote.messageId,
          upvotes: sql<number>`COUNT(*) FILTER (WHERE ${vote.isUpvoted} = true)`,
          downvotes: sql<number>`COUNT(*) FILTER (WHERE ${vote.isUpvoted} = false)`,
        })
        .from(vote)
        .where(
          and(
            eq(vote.chatId, chatId),
            sql`${vote.messageId} = ANY(${messageIds})`,
          ),
        )
        .groupBy(vote.messageId);

      return Object.fromEntries(
        results.map((r) => [
          r.messageId,
          {
            upvotes: r.upvotes,
            downvotes: r.downvotes,
            total: r.upvotes - r.downvotes,
          },
        ]),
      );
    },

    async hasUserVoted(
      userId: string,
      chatId: string,
      messageId: string,
    ): Promise<boolean> {
      const existing = await this.findByUserAndMessage(
        userId,
        chatId,
        messageId,
      );
      return !!existing;
    },
  };
}
