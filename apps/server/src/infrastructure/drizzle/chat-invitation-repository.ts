import type { DbInstance } from "@/db";
import { chatInvitation as chatInvitationTable } from "@/db/schema/chat";
import { ChatInvitation } from "@/domain/chat/chat-invitation";
import { Identifier, type Repository } from "@circulo-ai/core";
import { and, eq } from "drizzle-orm";

function toDomain(
  row: typeof chatInvitationTable.$inferSelect,
): ChatInvitation {
  return new ChatInvitation({
    id: Identifier.from(row.id),
    chatId: Identifier.from(row.chatId),
    inviterId: row.inviterId,
    email: row.email,
    inviteeId: row.inviteeId ?? null,
    role: row.role,
    status: row.status,
    token: row.token,
    message: row.message ?? null,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt ?? null,
    createdAt: row.createdAt,
  });
}

function toRow(
  entity: ChatInvitation,
): typeof chatInvitationTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    chatId: snap.chatId.toString(),
    inviterId: snap.inviterId,
    email: snap.email,
    inviteeId: snap.inviteeId ?? null,
    role: snap.role,
    status: snap.status,
    token: snap.token,
    message: snap.message ?? null,
    expiresAt: snap.expiresAt,
    acceptedAt: snap.acceptedAt ?? null,
    createdAt: snap.createdAt,
  };
}

export class DrizzleChatInvitationRepository implements Repository<ChatInvitation> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<ChatInvitation | null> {
    const row = await this.db.query.chatInvitation.findFirst({
      where: eq(chatInvitationTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: ChatInvitation): Promise<ChatInvitation> {
    const row = toRow(entity);
    await this.db
      .insert(chatInvitationTable)
      .values(row)
      .onConflictDoUpdate({
        target: chatInvitationTable.id,
        set: {
          status: row.status,
          inviteeId: row.inviteeId,
          acceptedAt: row.acceptedAt,
          message: row.message,
          expiresAt: row.expiresAt,
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(chatInvitationTable)
      .where(eq(chatInvitationTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }

  async findByToken(token: string): Promise<ChatInvitation | null> {
    const row = await this.db.query.chatInvitation.findFirst({
      where: eq(chatInvitationTable.token, token),
    });
    return row ? toDomain(row) : null;
  }

  async findPendingByEmail(
    email: string,
    chatId: Identifier,
  ): Promise<ChatInvitation | null> {
    const row = await this.db.query.chatInvitation.findFirst({
      where: and(
        eq(chatInvitationTable.email, email),
        eq(chatInvitationTable.chatId, chatId.toString()),
      ),
    });
    return row ? toDomain(row) : null;
  }
}
