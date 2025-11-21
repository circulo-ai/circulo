import { db, mcpServer } from "@/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export const mcpServerRepo = {
  async findById(id: string) {
    return db.query.mcpServer.findFirst({ where: eq(mcpServer.id, id) });
  },

  async create(data: typeof mcpServer.$inferInsert) {
    const [row] = await db.insert(mcpServer).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof mcpServer.$inferInsert>) {
    const [row] = await db
      .update(mcpServer)
      .set(data)
      .where(eq(mcpServer.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db
      .delete(mcpServer)
      .where(eq(mcpServer.id, id))
      .returning();
    return row;
  },

  // --- Custom Methods ---

  async findByChat(
    chatId: string,
    filters?: {
      enabled?: boolean;
    },
  ) {
    const conditions = [
      eq(mcpServer.chatId, chatId),
      isNull(mcpServer.deletedAt),
    ];

    if (filters?.enabled !== undefined) {
      conditions.push(eq(mcpServer.isEnabled, filters.enabled));
    }

    return db.query.mcpServer.findMany({
      where: and(...conditions),
      orderBy: sql`created_at desc`,
    });
  },

  async findEnabledByChat(chatId: string) {
    return db.query.mcpServer.findMany({
      where: and(
        eq(mcpServer.chatId, chatId),
        eq(mcpServer.isEnabled, true),
        isNull(mcpServer.deletedAt),
      ),
      orderBy: sql`created_at desc`,
    });
  },

  async findByIdAndChat(id: string, chatId: string) {
    return await db.query.mcpServer.findFirst({
      where: (servers, { eq, and, isNull }) =>
        and(
          eq(servers.id, id),
          eq(servers.chatId, chatId),
          isNull(servers.deletedAt),
        ),
    });
  },

  async softDelete(id: string) {
    const [deleted] = await db
      .update(mcpServer)
      .set({
        deletedAt: new Date(),
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(mcpServer.id, id))
      .returning();
    return deleted;
  },

  async toggleEnabled(id: string, isEnabled: boolean) {
    return this.update(id, { isEnabled });
  },

  async updateConnectionStatus(
    id: string,
    status: {
      connectionStatus: "connected" | "disconnected" | "error";
      lastConnected?: Date;
      lastError?: string | null;
    },
  ) {
    return this.update(id, {
      ...status,
      updatedAt: new Date(),
    });
  },

  async updateToolCount(id: string, toolCount: number) {
    return this.update(id, {
      toolCount,
      lastToolsRefreshAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async incrementUsage(id: string) {
    await db
      .update(mcpServer)
      .set({
        totalRequests: sql`${mcpServer.totalRequests} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mcpServer.id, id));
  },
};
