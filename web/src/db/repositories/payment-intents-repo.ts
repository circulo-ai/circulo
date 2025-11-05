import { db, paymentIntents } from "@/db";
import { eq, lt, sql } from "drizzle-orm";
import { makeRepo } from "../helpers/repo";

const paymentIntentsRepoFactory = makeRepo(paymentIntents, (base) => ({
  async findByOrderId(orderId: string) {
    return base.findMany({ where: eq(paymentIntents.orderId, orderId), limit: 1 }).then(rows => rows[0]);
  },
  async findByToken(token: string) {
    return base.findMany({ where: eq(paymentIntents.token, token), limit: 1 }).then(rows => rows[0]);
  },
  async findPendingOlderThanMinutes(minutes = 10, limit = 50) {
    const cutoff = sql`now() - interval '${minutes} minutes'`;
    return base.findMany({
      where: sql`(${paymentIntents.status} = 'pending') AND (${paymentIntents.createdAt} <= ${cutoff})`,
      orderBy: sql`${paymentIntents.createdAt} asc`,
      limit,
    });
  },
}), { primaryKey: "id" });

export const paymentIntentsRepo = paymentIntentsRepoFactory.with(db);
export const usePaymentIntentsRepo = paymentIntentsRepoFactory.with;
