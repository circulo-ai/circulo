import { db, message } from "@/db";
import { eq, sql } from "drizzle-orm";

export const messageRepo = {
  async findById(id: string) {
    return db.query.message.findFirst({ where: eq(message.id, id) });
  },

  async create(data: typeof message.$inferInsert) {
    const [row] = await db.insert(message).values(data).returning();
    return row;
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

  // --- Custom Methods ---

  async findForChat(chatId: string, limit?: number) {
    return db.query.message.findMany({
      where: eq(message.chatId, chatId),
      orderBy: sql`created_at asc`,
      limit,
    });
  },

  async findLatestForChat(chatId: string, limit = 50) {
    return db.query.message.findMany({
      where: eq(message.chatId, chatId),
      orderBy: sql`created_at desc`,
      limit,
    });
  },
};
