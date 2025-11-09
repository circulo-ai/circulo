import { db, message } from "@/db";
import { eq, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const messageRepoFactory = makeRepo(
  message,
  (base) => ({
    findForChat(chatId: string, limit?: number) {
      return base.findMany({
        where: eq(message.chatId, chatId),
        orderBy: sql`created_at asc`,
        limit,
      });
    },
    findLatestForChat(chatId: string, limit = 50) {
      return base.findMany({
        where: eq(message.chatId, chatId),
        orderBy: sql`created_at desc`,
        limit,
      });
    },
  }),
  { primaryKey: "id" }
);

export const messageRepo = messageRepoFactory.with(db);
export const useMessageRepo = messageRepoFactory.with;
