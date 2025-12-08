import type { DbInstance } from "@/db";
import { user as userTable } from "@/db/schema/auth";
import { User } from "@/domain/user/user";
import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";

function toDomain(row: typeof userTable.$inferSelect): User {
  return new User({
    id: Identifier.from(row.id),
    email: row.email,
    displayName: row.name ?? row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  });
}

function toRow(entity: User): typeof userTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    email: snap.email,
    name: snap.displayName,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt ?? new Date(),
  };
}

export class DrizzleUserRepository implements Repository<User> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<User | null> {
    const row = await this.db.query.user.findFirst({
      where: eq(userTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: User): Promise<User> {
    const row = toRow(entity);
    await this.db
      .insert(userTable)
      .values(row)
      .onConflictDoUpdate({
        target: userTable.id,
        set: {
          email: row.email,
          name: row.name,
          updatedAt: new Date(),
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(userTable)
      .where(eq(userTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
