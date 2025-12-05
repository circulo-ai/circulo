import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";
import { message as messageTable } from "@/db/schema/chat";
import type { DbInstance } from "@/db";
import { Message } from "@/domain/message/message";

function toDomain(row: typeof messageTable.$inferSelect): Message {
  return new Message({
    id: Identifier.from(row.id),
    chatId: Identifier.from(row.chatId),
    authorId: row.authorId,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.editedAt ?? undefined,
  });
}

function toRow(entity: Message): typeof messageTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    chatId: snap.chatId.toString(),
    authorId: snap.authorId,
    authorType: "user",
    role: "user",
    content: snap.content,
    parts: [],
    attachments: [],
    tokenCount: 0,
    cost: "0",
    quotedMessageId: null,
    isEdited: !!snap.updatedAt,
    editedAt: snap.updatedAt ?? null,
    isDeleted: false,
    deletedAt: null,
    createdAt: snap.createdAt,
  };
}

export class DrizzleMessageRepository implements Repository<Message> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<Message | null> {
    const row = await this.db.query.message.findFirst({
      where: eq(messageTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: Message): Promise<Message> {
    const row = toRow(entity);
    await this.db
      .insert(messageTable)
      .values(row)
      .onConflictDoUpdate({
        target: messageTable.id,
        set: {
          content: row.content,
          isEdited: row.isEdited,
          editedAt: row.editedAt,
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .update(messageTable)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(messageTable.id, id.toString()));
    return "rowCount" in result ? (result as { rowCount: number }).rowCount > 0 : true;
  }
}
