import { agent, chat, db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const agentRepoFactory = makeRepo(agent, (base) => ({
  findLatest(limit = 20) {
    return base.findMany({ orderBy: sql`created_at desc`, limit });
  },
  findForUser(userId: string) {
    return base.findMany({ where: eq(chat.userId, userId) });
  },
}), { primaryKey: "id" });

export const agentRepo = agentRepoFactory.with(db);
export const useAgentRepo = agentRepoFactory.with;
