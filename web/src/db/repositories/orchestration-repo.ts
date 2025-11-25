import { db } from "@/db";
import { orchestrationLog } from "@/db/schema/orchestration";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export interface OrchestrationLogFilters {
  chatId?: string;
  messageId?: string;
  triggerType?: string;
  strategy?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export const orchestrationLogRepo = {
  async findById(id: string) {
    return db.query.orchestrationLog.findFirst({
      where: eq(orchestrationLog.id, id),
    });
  },

  async create(data: typeof orchestrationLog.$inferInsert) {
    const [row] = await db.insert(orchestrationLog).values(data).returning();
    return row;
  },

  async update(
    id: string,
    data: Partial<typeof orchestrationLog.$inferInsert>,
  ) {
    const [row] = await db
      .update(orchestrationLog)
      .set(data)
      .where(eq(orchestrationLog.id, id))
      .returning();
    return row;
  },

  // --- Query Methods ---

  async findForChat(
    chatId: string,
    opts?: { limit?: number; successOnly?: boolean },
  ) {
    const conditions = [eq(orchestrationLog.chatId, chatId)];

    if (opts?.successOnly) {
      conditions.push(eq(orchestrationLog.success, true));
    }

    return db.query.orchestrationLog.findMany({
      where: and(...conditions),
      orderBy: desc(orchestrationLog.createdAt),
      limit: opts?.limit ?? 50,
    });
  },

  async findForMessage(messageId: string) {
    return db.query.orchestrationLog.findFirst({
      where: eq(orchestrationLog.messageId, messageId),
    });
  },

  async findMany(filters: OrchestrationLogFilters) {
    const conditions = [];

    if (filters.chatId) {
      conditions.push(eq(orchestrationLog.chatId, filters.chatId));
    }
    if (filters.messageId) {
      conditions.push(eq(orchestrationLog.messageId, filters.messageId));
    }
    if (filters.triggerType) {
      conditions.push(eq(orchestrationLog.triggerType, filters.triggerType));
    }
    if (filters.strategy) {
      conditions.push(eq(orchestrationLog.strategy, filters.strategy));
    }
    if (filters.success !== undefined) {
      conditions.push(eq(orchestrationLog.success, filters.success));
    }
    if (filters.startDate) {
      conditions.push(gte(orchestrationLog.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(orchestrationLog.createdAt, filters.endDate));
    }

    return db.query.orchestrationLog.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(orchestrationLog.createdAt),
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  },

  // --- Analytics ---

  async getSuccessRate(chatId: string, days = 30): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        total: sql<number>`count(*)`,
        successful: sql<number>`count(*) filter (where ${orchestrationLog.success} = true)`,
      })
      .from(orchestrationLog)
      .where(
        and(
          eq(orchestrationLog.chatId, chatId),
          gte(orchestrationLog.createdAt, cutoff),
        ),
      );

    const row = result[0];
    if (!row || row.total === 0) return 0;

    return (row.successful / row.total) * 100;
  },

  async getAverageExecutionTime(chatId: string, days = 30): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        avgTime: sql<number>`avg(${orchestrationLog.executionTimeMs})`,
      })
      .from(orchestrationLog)
      .where(
        and(
          eq(orchestrationLog.chatId, chatId),
          gte(orchestrationLog.createdAt, cutoff),
          eq(orchestrationLog.success, true),
        ),
      );

    return Math.round(result[0]?.avgTime ?? 0);
  },

  async getMostUsedStrategy(chatId: string, days = 30): Promise<string | null> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        strategy: orchestrationLog.strategy,
        count: sql<number>`count(*)`,
      })
      .from(orchestrationLog)
      .where(
        and(
          eq(orchestrationLog.chatId, chatId),
          gte(orchestrationLog.createdAt, cutoff),
        ),
      )
      .groupBy(orchestrationLog.strategy)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    return result[0]?.strategy ?? null;
  },

  async getTotalTokensUsed(chatId: string, days = 30): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        total: sql<number>`coalesce(sum(${orchestrationLog.totalTokenCount}), 0)`,
      })
      .from(orchestrationLog)
      .where(
        and(
          eq(orchestrationLog.chatId, chatId),
          gte(orchestrationLog.createdAt, cutoff),
        ),
      );

    return result[0]?.total ?? 0;
  },

  async getFailuresByAgent(chatId: string, days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db.query.orchestrationLog.findMany({
      where: and(
        eq(orchestrationLog.chatId, chatId),
        gte(orchestrationLog.createdAt, cutoff),
        eq(orchestrationLog.success, false),
      ),
    });

    // Aggregate failures by agent
    const failuresByAgent: Record<
      string,
      { agentName: string; count: number; errors: string[] }
    > = {};

    for (const log of logs) {
      if (log.agentResults) {
        for (const result of log.agentResults as any[]) {
          if (!result.success) {
            if (!failuresByAgent[result.agentId]) {
              failuresByAgent[result.agentId] = {
                agentName: result.agentName,
                count: 0,
                errors: [],
              };
            }
            failuresByAgent[result.agentId].count++;
            if (result.error) {
              failuresByAgent[result.agentId].errors.push(result.error);
            }
          }
        }
      }
    }

    return failuresByAgent;
  },

  // --- Cleanup ---

  async deleteOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(orchestrationLog)
      .where(lte(orchestrationLog.createdAt, cutoff))
      .returning();

    return result.length;
  },

  async countForChat(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orchestrationLog)
      .where(eq(orchestrationLog.chatId, chatId));

    return result[0]?.count ?? 0;
  },
};
