import { agent, db } from "@/db";
import { eq, sql } from "drizzle-orm";

export const agentRepo = {
  findById(id: string) {
    return db.query.agent.findFirst({ where: eq(agent.id, id) });
  },

  async create(data: typeof agent.$inferInsert) {
    const [row] = await db.insert(agent).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof agent.$inferInsert>) {
    const [row] = await db
      .update(agent)
      .set(data)
      .where(eq(agent.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db.delete(agent).where(eq(agent.id, id)).returning();
    return row;
  },

  async findLatest(limit = 20) {
    return db.query.agent.findMany({
      orderBy: sql`created_at desc`,
      limit,
    });
  },

  async findForUser(userId: string) {
    return db.query.agent.findMany({
      where: eq(agent.userId, userId),
    });
  },
};
