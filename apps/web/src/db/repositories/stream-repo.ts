import { db } from "@/db";
import { stream } from "@/db/schema";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";

export const streamRepo = {
  async findById(id: string) {
    return db.query.stream.findFirst({ where: eq(stream.id, id) });
  },

  async create(data: typeof stream.$inferInsert) {
    const [row] = await db.insert(stream).values(data).returning();
    return row;
  },

  async createStreamId({
    streamId,
    chatId,
  }: {
    streamId: string;
    chatId: string;
  }) {
    try {
      await db
        .insert(stream)
        .values({ id: streamId, chatId, createdAt: new Date() });
    } catch (_error) {
      throw new Error("Failed to create stream id");
    }
  },

  async delete(id: string) {
    const [row] = await db.delete(stream).where(eq(stream.id, id)).returning();
    return row;
  },

  // --- Query Methods ---

  async getStreamIdsByChatId({ chatId }: { chatId: string }) {
    try {
      const streamIds = await db
        .select({ id: stream.id })
        .from(stream)
        .where(eq(stream.chatId, chatId))
        .orderBy(asc(stream.createdAt))
        .execute();

      return streamIds.map(({ id }) => id);
    } catch (_error) {
      throw new Error("Failed to get stream ids by chat id");
    }
  },

  async findForChat(chatId: string, opts?: { limit?: number }) {
    return db.query.stream.findMany({
      where: eq(stream.chatId, chatId),
      orderBy: desc(stream.createdAt),
      limit: opts?.limit ?? 10,
    });
  },

  async findLatestForChat(chatId: string) {
    return db.query.stream.findFirst({
      where: eq(stream.chatId, chatId),
      orderBy: desc(stream.createdAt),
    });
  },

  async findActiveForChat(chatId: string, maxAgeMinutes = 30) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    return db.query.stream.findMany({
      where: and(
        eq(stream.chatId, chatId),
        sql`${stream.createdAt} > ${cutoff}`,
      ),
      orderBy: desc(stream.createdAt),
    });
  },

  // --- Cleanup ---

  async deleteForChat(chatId: string) {
    const result = await db
      .delete(stream)
      .where(eq(stream.chatId, chatId))
      .returning();
    return result.length;
  },

  async deleteOlderThan(date: Date) {
    const result = await db
      .delete(stream)
      .where(lt(stream.createdAt, date))
      .returning();
    return result.length;
  },

  async cleanupStale(maxAgeHours = 24) {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    return this.deleteOlderThan(cutoff);
  },

  async countForChat(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(stream)
      .where(eq(stream.chatId, chatId));
    return result[0]?.count ?? 0;
  },
};
