import type { DbInstance } from "@/db";
import { chat as chatTable } from "@/db/schema/chat";
import { Chat } from "@/domain/chat/chat";
import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";

function toDomain(row: typeof chatTable.$inferSelect): Chat {
  return new Chat({
    id: Identifier.from(row.id),
    title: row.title,
    organizationId: row.organizationId,
    creatorId: row.creatorId,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
  });
}

function toRow(entity: Chat): typeof chatTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    title: snap.title,
    organizationId: snap.organizationId,
    creatorId: snap.creatorId,
    visibility: snap.visibility,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt ?? new Date(),
  };
}

export class DrizzleChatRepository implements Repository<Chat> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Chat | null> {
    const row = await this.db.query.chat.findFirst({
      where: eq(chatTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async findById(id: Identifier | string): Promise<Chat | null> {
    return this.getById(
      typeof id === "string" ? Identifier.from(id) : id,
    );
  }

  async save(entity: Chat): Promise<Chat> {
    const row = toRow(entity);
    await this.db
      .insert(chatTable)
      .values(row)
      .onConflictDoUpdate({
        target: chatTable.id,
        set: {
          title: row.title,
          visibility: row.visibility,
          updatedAt: row.updatedAt ?? new Date(),
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(chatTable)
      .where(eq(chatTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }

  async softDeleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .update(chatTable)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(chatTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
