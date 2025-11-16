import { db, tool } from "@/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const toolRepoFactory = makeRepo(
  tool,
  (base) => ({
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

      let query = base.findMany({
        where: and(...conditions),
        orderBy: sql`created_at desc`,
      });

      // Note: Search filtering needs to be done after the query
      // because we can't chain ilike with the base.findMany approach
      return query;
    },

    async findSystemTools() {
      return base.findMany({
        where: and(eq(tool.isSystem, true), eq(tool.isActive, true)),
        orderBy: sql`name asc`,
      });
    },

    async findByMcpServer(mcpServerId: string) {
      return base.findMany({
        where: and(
          eq(tool.mcpServerId, mcpServerId),
          eq(tool.isActive, true),
        ),
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
      return base.update(id, { isActive });
    },
  }),
  { primaryKey: "id" },
);

export const toolRepo = toolRepoFactory.with(db);
export const useToolRepo = toolRepoFactory.with;