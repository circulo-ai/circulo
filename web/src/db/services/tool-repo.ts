import { db, tool } from "@/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";

export const toolRepo = {
  // --- Basic CRUD (Replacing makeRepo) ---
  async findById(id: string) {
    return db.query.tool.findFirst({ where: eq(tool.id, id) });
  },

  async create(data: typeof tool.$inferInsert) {
    const [row] = await db.insert(tool).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof tool.$inferInsert>) {
    const [row] = await db
      .update(tool)
      .set(data)
      .where(eq(tool.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db.delete(tool).where(eq(tool.id, id)).returning();
    return row;
  },

  // --- Custom Methods ---

  async findForUser(
    userId: string,
    filters?: {
      type?: string;
      isActive?: boolean;
      search?: string;
    },
  ) {
    const conditions = [eq(tool.userId, userId)];

    if (filters?.type) {
      conditions.push(eq(tool.type, filters.type));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(tool.isActive, filters.isActive));
    }

    // Note: Search filtering filtering logic is identical to previous repo
    // Search needs to be done after query if using simple findMany without fancy ILIKE composition
    // or use the explicit search method below
    return db.query.tool.findMany({
      where: and(...conditions),
      orderBy: sql`created_at desc`,
    });
  },

  async findSystemTools() {
    return db.query.tool.findMany({
      where: and(eq(tool.isSystem, true), eq(tool.isActive, true)),
      orderBy: sql`name asc`,
    });
  },

  async findByMcpServer(mcpServerId: string) {
    return db.query.tool.findMany({
      where: and(eq(tool.mcpServerId, mcpServerId), eq(tool.isActive, true)),
      orderBy: sql`name asc`,
    });
  },

  async search(userId: string, searchTerm: string) {
    return await db
      .select()
      .from(tool)
      .where(
        and(
          or(eq(tool.userId, userId), eq(tool.isSystem, true)),
          eq(tool.isActive, true),
          or(
            ilike(tool.name, `%${searchTerm}%`),
            ilike(tool.description, `%${searchTerm}%`),
          ),
        ),
      )
      .orderBy(sql`name asc`);
  },

  async toggleActive(id: string, isActive: boolean) {
    return this.update(id, { isActive });
  },
};
