import { db, mcpServer } from "@/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const mcpServerRepoFactory = makeRepo(
  mcpServer,
  (base) => ({
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
        conditions.push(eq(mcpServer.enabled, filters.enabled));
      }

      return base.findMany({
        where: and(...conditions),
        orderBy: sql`created_at desc`,
      });
    },

    async findEnabledByChat(chatId: string) {
      return base.findMany({
        where: and(
          eq(mcpServer.chatId, chatId),
          eq(mcpServer.enabled, true),
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
          enabled: false,
          updatedAt: new Date(),
        })
        .where(eq(mcpServer.id, id))
        .returning();
      return deleted;
    },

    async toggleEnabled(id: string, enabled: boolean) {
      return base.update(id, { enabled });
    },

    async updateConnectionStatus(
      id: string,
      status: {
        connectionStatus: string;
        lastConnected?: Date;
        lastError?: string | null;
      },
    ) {
      return base.update(id, {
        ...status,
        updatedAt: new Date(),
      });
    },

    async updateToolCount(id: string, toolCount: number) {
      return base.update(id, {
        toolCount,
        lastToolsRefresh: new Date(),
        updatedAt: new Date(),
      });
    },

    async incrementUsage(id: string) {
      await db
        .update(mcpServer)
        .set({
          totalRequests: sql`${mcpServer.totalRequests} + 1`,
          lastUsed: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mcpServer.id, id));
    },
  }),
  { primaryKey: "id" },
);

export const mcpServerRepo = mcpServerRepoFactory.with(db);
export const useMcpServerRepo = mcpServerRepoFactory.with;