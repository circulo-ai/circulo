import type { DbInstance } from "@/db";
import { message as messageTable, vote as voteTable } from "@/db/schema/chat";
import { Message } from "@/domain/message/message";
import { Identifier, type Repository } from "@circulo-ai/core";
import { and, eq, gt, gte, inArray, or } from "drizzle-orm";

function toDomain(row: typeof messageTable.$inferSelect): Message {
  return new Message({
    id: Identifier.from(row.id),
    chatId: Identifier.from(row.chatId),
    authorId: row.authorId,
    content: row.content,
    parts: row.parts,
    attachments: row.attachments,
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
    parts: snap.parts,
    attachments: snap.attachments,
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

  async findById(id: Identifier | string): Promise<Message | null> {
    return this.getById(typeof id === "string" ? Identifier.from(id) : id);
  }

  async save(entity: Message): Promise<Message> {
    const row = toRow(entity);
    await this.db
      .insert(messageTable)
      .values(row)
      .onConflictDoUpdate({
        target: messageTable.id,
        set: {
          role: row.role,
          authorType: row.authorType,
          authorId: row.authorId,
          parts: row.parts,
          attachments: row.attachments,
          content: row.content,
          isDeleted: false,
          deletedAt: null,
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
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }

  async deleteByChatIdAfterTimestamp({
    chatId,
    timestamp,
    anchorId,
  }: {
    chatId: string;
    timestamp: Date;
    anchorId?: string;
  }): Promise<boolean> {
    const afterAnchor = anchorId
      ? or(
          gt(messageTable.createdAt, timestamp),
          and(
            eq(messageTable.createdAt, timestamp),
            gte(messageTable.id, anchorId),
          ),
        )
      : gte(messageTable.createdAt, timestamp);

    const messageIds = await this.db
      .select({ id: messageTable.id })
      .from(messageTable)
      .where(and(eq(messageTable.chatId, chatId), afterAnchor));

    if (messageIds.length === 0) return false;

    const ids = messageIds.map((row) => row.id);

    await this.db
      .delete(voteTable)
      .where(
        and(eq(voteTable.chatId, chatId), inArray(voteTable.messageId, ids)),
      );

    const result = await this.db
      .update(messageTable)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(
        and(eq(messageTable.chatId, chatId), inArray(messageTable.id, ids)),
      )
      .returning({ id: messageTable.id });

    return result.length > 0;
  }

  /**
   * Replace a user message as a new durable version while retaining the old
   * version as a soft-deleted record. The replacement is committed atomically
   * with the trailing-message tombstones so a re-orchestration can never run
   * against a message that is absent from the visible history.
   */
  async replaceTrailingWithMessage({
    chatId,
    messageId,
    replacement,
  }: {
    chatId: string;
    messageId: string;
    replacement: {
      id: string;
      authorId: string;
      content: string;
      parts: unknown[];
      attachments: unknown[];
    };
  }) {
    return this.db.transaction(async (tx) => {
      // A lost HTTP response may cause the client to retry the edit. Treat
      // the replacement ID as an idempotency key before looking up the now
      // superseded anchor message.
      const existingReplacement = await tx.query.message.findFirst({
        where: eq(messageTable.id, replacement.id),
      });
      if (existingReplacement) {
        if (
          existingReplacement.chatId !== chatId ||
          existingReplacement.authorId !== replacement.authorId ||
          existingReplacement.role !== "user"
        ) {
          throw new Error("Replacement message ID is already in use");
        }
        return existingReplacement;
      }

      const anchor = await tx.query.message.findFirst({
        where: and(
          eq(messageTable.id, messageId),
          eq(messageTable.chatId, chatId),
          eq(messageTable.isDeleted, false),
        ),
      });
      if (!anchor) return null;

      const trailing = await tx
        .select({ id: messageTable.id })
        .from(messageTable)
        .where(
          and(
            eq(messageTable.chatId, chatId),
            eq(messageTable.isDeleted, false),
            or(
              gt(messageTable.createdAt, anchor.createdAt),
              and(
                eq(messageTable.createdAt, anchor.createdAt),
                gte(messageTable.id, anchor.id),
              ),
            ),
          ),
        );
      const trailingIds = trailing.map((row) => row.id);
      const deletedAt = new Date();

      if (trailingIds.length > 0) {
        await tx
          .delete(voteTable)
          .where(
            and(
              eq(voteTable.chatId, chatId),
              inArray(voteTable.messageId, trailingIds),
            ),
          );
        await tx
          .update(messageTable)
          .set({ isDeleted: true, deletedAt })
          .where(
            and(
              eq(messageTable.chatId, chatId),
              inArray(messageTable.id, trailingIds),
            ),
          );
      }

      const [created] = await tx
        .insert(messageTable)
        .values({
          id: replacement.id,
          chatId,
          authorType: "user",
          authorId: replacement.authorId,
          role: "user",
          content: replacement.content,
          parts: replacement.parts,
          attachments: replacement.attachments,
          tokenCount: 0,
          cost: "0",
          quotedMessageId: messageId,
          isEdited: true,
          editedAt: deletedAt,
          isDeleted: false,
          deletedAt: null,
        })
        .returning();

      return created;
    });
  }
}
