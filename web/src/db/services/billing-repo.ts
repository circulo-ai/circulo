import { db, subscriptionPlans } from "@/db";
import { eq } from "drizzle-orm";

export const plansRepo = {
  async findById(id: number) {
    return db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, id),
    });
  },

  async create(data: typeof subscriptionPlans.$inferInsert) {
    const [row] = await db.insert(subscriptionPlans).values(data).returning();
    return row;
  },

  async update(
    id: number,
    data: Partial<typeof subscriptionPlans.$inferInsert>,
  ) {
    const [row] = await db
      .update(subscriptionPlans)
      .set(data)
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return row;
  },

  async delete(id: number) {
    const [row] = await db
      .delete(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return row;
  },
};
