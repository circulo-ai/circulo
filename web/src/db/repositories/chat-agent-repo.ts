import { db, chatAgent } from "@/db";
import { and, eq } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const chatAgentRepoFactory = makeRepo(
  chatAgent,
  (base) => ({
    async findEnabledForChat(chatId: string) {
      return db.query.chatAgent.findMany({
        where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
        orderBy: (ca, { asc }) => [asc(ca.speakOrder)],
        with: { agent: true },
      });
    },

    async updateSpeakOrder(chatId: string, agentId: string, newOrder: number) {
      return db
        .update(chatAgent)
        .set({ speakOrder: newOrder })
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId))
        )
        .returning();
    },

    async toggleEnabled(chatId: string, agentId: string) {
      const current = await db.query.chatAgent.findFirst({
        where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
      });

      if (!current) return null;

      return db
        .update(chatAgent)
        .set({ enabled: !current.enabled })
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId))
        )
        .returning();
    },
  }),
  { primaryKey: "id" }
);

export const chatAgentRepo = chatAgentRepoFactory.with(db);