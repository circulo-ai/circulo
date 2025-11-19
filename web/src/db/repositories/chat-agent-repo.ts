import { chatAgent, db } from "@/db";
import { and, eq } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const chatAgentRepoFactory = makeRepo(
  chatAgent,
  (base) => ({
    async findForChat(chatId: string) {
      return db.query.chatAgent.findMany({
        where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
        with: { agent: true },
      });
    },

    async findForUserAndChat(userId: string, chatId: string) {
      return db.query.chatAgent.findMany({
        where: and(
          eq(chatAgent.chatId, chatId),
          eq(chatAgent.enabled, true),
          eq(chatAgent.addedBy, userId),
        ),
        with: { agent: true },
      });
    },

    async findEnabledForChat(chatId: string) {
      return db.query.chatAgent.findMany({
        where: and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
        with: { agent: true },
      });
    },

    async findAgentInChat(agentId: string, chatId: string) {
      return db.query.chatAgent.findMany({
        where: and(
          eq(chatAgent.chatId, chatId),
          eq(chatAgent.agentId, agentId),
          eq(chatAgent.enabled, true),
        ),
        with: { agent: true },
      });
    },

    async toggleEnabled(chatId: string, agentId: string) {
      const current = await db.query.chatAgent.findFirst({
        where: and(
          eq(chatAgent.chatId, chatId),
          eq(chatAgent.agentId, agentId),
        ),
      });

      if (!current) return null;

      return db
        .update(chatAgent)
        .set({ enabled: !current.enabled })
        .where(
          and(eq(chatAgent.chatId, chatId), eq(chatAgent.agentId, agentId)),
        )
        .returning();
    },
  }),
  { primaryKey: "id" },
);

export const chatAgentRepo = chatAgentRepoFactory.with(db);
