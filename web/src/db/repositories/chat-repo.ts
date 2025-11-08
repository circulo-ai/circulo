import { chat, db, chatAgent } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const chatRepoFactory = makeRepo(chat, (base) => ({
  findLatest(limit = 20) {
    return base.findMany({ orderBy: sql`created_at desc`, limit });
  },
  findForUser(userId: string) {
    return base.findMany({ where: eq(chat.userId, userId) });
  },
  /**
   * Retrieve agents linked to a chat, ordered by speakOrder.
   * By default only returns enabled agents.
   */
  async findAgentsForChat(chatId: string, opts?: { includeDisabled?: boolean }) {
    const rows = await db.query.chatAgent.findMany({
      where: opts?.includeDisabled
        ? eq(chatAgent.chatId, chatId)
        : and(eq(chatAgent.chatId, chatId), eq(chatAgent.enabled, true)),
      orderBy: (ca, { asc }) => [asc(ca.speakOrder)],
      with: { agent: true },
    });
    return rows.map((r) => r.agent);
  },
}), { primaryKey: "id" });

export const chatRepo = chatRepoFactory.with(db);
export const useChatRepo = chatRepoFactory.with;
