import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DbInstance } from "../index";
import { agent, type Agent } from "../schema";

export interface AgentFilters {
  organizationId: string;
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export function createAgentRepository(database: DbInstance) {
  const db = database;
  return {
    async findById(id: string): Promise<Agent | undefined> {
      return db.query.agent.findFirst({
        where: and(eq(agent.id, id), eq(agent.isArchived, false)),
      });
    },

    async create(data: typeof agent.$inferInsert): Promise<Agent> {
      const [row] = await db.insert(agent).values(data).returning();
      return row;
    },

    async update(
      id: string,
      data: Partial<typeof agent.$inferInsert>,
    ): Promise<Agent | undefined> {
      const [row] = await db
        .update(agent)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agent.id, id))
        .returning();
      return row;
    },

    async archive(id: string): Promise<Agent | undefined> {
      const [row] = await db
        .update(agent)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(agent.id, id))
        .returning();
      return row;
    },

    async delete(id: string): Promise<Agent | undefined> {
      const [row] = await db.delete(agent).where(eq(agent.id, id)).returning();
      return row;
    },

    // --- Query Methods ---

    async findByOrganization(filters: AgentFilters): Promise<Agent[]> {
      const conditions = [eq(agent.organizationId, filters.organizationId)];

      if (!filters.includeArchived) {
        conditions.push(eq(agent.isArchived, false));
      }

      if (filters.search) {
        conditions.push(
          or(
            ilike(agent.name, `%${filters.search}%`),
            ilike(agent.description, `%${filters.search}%`),
          )!,
        );
      }

      return db.query.agent.findMany({
        where: and(...conditions),
        orderBy: desc(agent.createdAt),
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      });
    },

    async findByCreator(
      userId: string,
      organizationId: string,
    ): Promise<Agent[]> {
      return db.query.agent.findMany({
        where: and(
          eq(agent.createdBy, userId),
          eq(agent.organizationId, organizationId),
          eq(agent.isArchived, false),
        ),
        orderBy: desc(agent.createdAt),
      });
    },

    async countByOrganization(organizationId: string): Promise<number> {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(agent)
        .where(
          and(
            eq(agent.organizationId, organizationId),
            eq(agent.isArchived, false),
          ),
        );
      return result[0]?.count ?? 0;
    },

    async findByName(
      organizationId: string,
      name: string,
    ): Promise<Agent | undefined> {
      return db.query.agent.findFirst({
        where: and(
          eq(agent.organizationId, organizationId),
          eq(agent.name, name),
        ),
      });
    },
  };
}
