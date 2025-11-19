import { chat, chatAgent, db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const chatRepoFactory = makeRepo(
  chat,
  (base) => ({
    findLatest(limit = 20) {
      return base.findMany({ orderBy: sql`created_at desc`, limit });
    },

    findForUser(userId: string) {
      return base.findMany({ where: eq(chat.creatorId, userId) });
    },

    /**
     * Retrieve agents linked to a chat
     * By default only returns enabled agents.
     */
    async findAgentsForChat(
      chatId: string,
      opts?: { includeDisabled?: boolean; search?: string },
    ) {
      let whereClause = opts?.includeDisabled
        ? eq(chatAgent.chatId, chatId)
        : and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true));

      const rows = await db.query.chatAgent.findMany({
        where: whereClause,
        with: { agent: true },
      });

      let agents = rows.map((r) => r.agent);

      // Apply search filter if provided
      if (opts?.search) {
        const searchLower = opts.search.toLowerCase();
        agents = agents.filter(
          (agent) =>
            agent.name.toLowerCase().includes(searchLower) ||
            agent.description?.toLowerCase().includes(searchLower),
        );
      }

      return agents;
    },

    /**
     * Update an agent's chat configuration.
     */
    async updateAgent(
      chatId: string,
      agentId: string,
      update: {
        enabled?: boolean;
        customSystemPrompt?: string | null;
        customTemperature?: number | null;
      },
    ) {
      const [updated] = await db
        .update(chatAgent)
        .set({
          enabled: update.enabled,
          customSystemPrompt: update.customSystemPrompt ?? undefined,
          customTemperature: update.customTemperature
            ? String(update.customTemperature)
            : null,
        })
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
        )
        .returning();
      return updated;
    },

    /**
     * Remove an agent from a chat.
     */
    async removeAgent(chatId: string, agentId: string) {
      const [deleted] = await db
        .delete(chatAgent)
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
        )
        .returning();
      return deleted;
    },
  }),
  { primaryKey: "id" },
);

export const chatRepo = chatRepoFactory.with(db);
export const useChatRepo = chatRepoFactory.with;
