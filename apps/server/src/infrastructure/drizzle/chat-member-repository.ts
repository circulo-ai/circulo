import type { DbInstance } from "@/db";
import { chatMember as chatMemberTable } from "@/db/schema/chat";
import { ChatMember } from "@/domain/chat/chat-member";
import { Identifier, type Repository } from "@circulo-ai/core";
import { eq } from "drizzle-orm";

function toDomain(row: typeof chatMemberTable.$inferSelect): ChatMember {
  return new ChatMember({
    id: Identifier.from(row.id),
    chatId: Identifier.from(row.chatId),
    userId: row.userId,
    role: row.role,
    canInvite: row.canInvite,
    canManageAgents: row.canManageAgents,
    canManageKnowledge: row.canManageKnowledge,
    notificationsEnabled: row.notificationsEnabled,
    lastReadAt: row.lastReadAt ?? null,
    unreadCount: row.unreadCount,
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt ?? null,
    pinOrder: row.pinOrder ?? null,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt ?? null,
  });
}

function toRow(entity: ChatMember): typeof chatMemberTable.$inferInsert {
  const snap = entity.snapshot;
  return {
    id: snap.id.toString(),
    chatId: snap.chatId.toString(),
    userId: snap.userId,
    role: snap.role,
    canInvite: snap.canInvite,
    canManageAgents: snap.canManageAgents,
    canManageKnowledge: snap.canManageKnowledge,
    notificationsEnabled: snap.notificationsEnabled,
    lastReadAt: snap.lastReadAt ?? null,
    unreadCount: snap.unreadCount,
    isPinned: snap.isPinned,
    pinnedAt: snap.pinnedAt ?? null,
    pinOrder: snap.pinOrder ?? null,
    joinedAt: snap.joinedAt,
    leftAt: snap.leftAt ?? null,
  };
}

export class DrizzleChatMemberRepository implements Repository<ChatMember> {
  constructor(private readonly db: DbInstance) {}

  async getById(id: Identifier): Promise<ChatMember | null> {
    const row = await this.db.query.chatMember.findFirst({
      where: eq(chatMemberTable.id, id.toString()),
    });
    return row ? toDomain(row) : null;
  }

  async save(entity: ChatMember): Promise<ChatMember> {
    const row = toRow(entity);
    await this.db
      .insert(chatMemberTable)
      .values(row)
      .onConflictDoUpdate({
        target: chatMemberTable.id,
        set: {
          role: row.role,
          canInvite: row.canInvite,
          canManageAgents: row.canManageAgents,
          canManageKnowledge: row.canManageKnowledge,
          notificationsEnabled: row.notificationsEnabled,
          lastReadAt: row.lastReadAt,
          unreadCount: row.unreadCount,
          isPinned: row.isPinned,
          pinnedAt: row.pinnedAt,
          pinOrder: row.pinOrder,
          leftAt: row.leftAt,
        },
      });
    return entity;
  }

  async deleteById(id: Identifier): Promise<boolean> {
    const result = await this.db
      .delete(chatMemberTable)
      .where(eq(chatMemberTable.id, id.toString()));
    return "rowCount" in result
      ? (result as { rowCount: number }).rowCount > 0
      : true;
  }
}
