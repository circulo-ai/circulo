import { db } from "@/db";
import { user, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

export const userRepo = {
  async findById(id: string): Promise<User | undefined> {
    return db.query.user.findFirst({
      where: eq(user.id, id),
    });
  },

  async findByEmail(email: string): Promise<User | undefined> {
    return db.query.user.findFirst({
      where: eq(user.email, email),
    });
  },

  async getByEmail(email: string): Promise<User[]> {
    try {
      return await db.select().from(user).where(eq(user.email, email));
    } catch (_error) {
      throw new Error("Failed to get user by email");
    }
  },

  async create(data: typeof user.$inferInsert): Promise<User> {
    const [row] = await db.insert(user).values(data).returning();
    return row;
  },

  async update(
    id: string,
    data: Partial<typeof user.$inferInsert>
  ): Promise<User | undefined> {
    const [row] = await db
      .update(user)
      .set(data)
      .where(eq(user.id, id))
      .returning();
    return row;
  },

  async delete(id: string): Promise<User | undefined> {
    const [row] = await db.delete(user).where(eq(user.id, id)).returning();
    return row;
  },
};
