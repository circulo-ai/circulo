import { db } from "@/db";
import { chatMember } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const chatMemberRepo = {
  async findById(id: string) {
    return db.query.chatMember.findFirst({ where: eq(chatMember.id, id) });
  },

  async findByUserAndChat(userId: string, chatId: string) {
    return db.query.chatMember.findFirst({
      where: and(
        eq(chatMember.userId, userId),
        eq(chatMember.chatId, chatId),
        sql`${chatMember.leftAt} IS NULL`,
      ),
    });
  },

  async create(data: typeof chatMember.$inferInsert) {
    const [row] = await db.insert(chatMember).values(data).returning();
    return row;
  },

  async update(id: string, data: Partial<typeof chatMember.$inferInsert>) {
    const [row] = await db
      .update(chatMember)
      .set(data)
      .where(eq(chatMember.id, id))
      .returning();
    return row;
  },

  async delete(id: string) {
    const [row] = await db
      .delete(chatMember)
      .where(eq(chatMember.id, id))
      .returning();
    return row;
  },

  // --- Query Methods ---

  async findForChat(chatId: string, opts?: { includeLeft?: boolean }) {
    const conditions = [eq(chatMember.chatId, chatId)];
    if (!opts?.includeLeft) {
      conditions.push(sql`${chatMember.leftAt} IS NULL`);
    }

    return db.query.chatMember.findMany({
      where: and(...conditions),
      with: { user: true },
      orderBy: desc(chatMember.joinedAt),
    });
  },

  async findChatsForUser(
    userId: string,
    opts?: { pinnedOnly?: boolean; limit?: number },
  ) {
    const conditions = [
      eq(chatMember.userId, userId),
      sql`${chatMember.leftAt} IS NULL`,
    ];

    if (opts?.pinnedOnly) {
      conditions.push(eq(chatMember.isPinned, true));
    }

    return db.query.chatMember.findMany({
      where: and(...conditions),
      with: { chat: true },
      orderBy: [desc(chatMember.isPinned), desc(chatMember.pinnedAt)],
      limit: opts?.limit ?? 50,
    });
  },

  async isMember(userId: string, chatId: string): Promise<boolean> {
    const member = await this.findByUserAndChat(userId, chatId);
    return !!member;
  },

  async hasRole(
    userId: string,
    chatId: string,
    roles: string[],
  ): Promise<boolean> {
    const member = await this.findByUserAndChat(userId, chatId);
    return !!member && roles.includes(member.role);
  },

  // --- Member Actions ---

  async leave(userId: string, chatId: string) {
    const [row] = await db
      .update(chatMember)
      .set({ leftAt: new Date() })
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .returning();
    return row;
  },

  async rejoin(userId: string, chatId: string) {
    const [row] = await db
      .update(chatMember)
      .set({ leftAt: null, joinedAt: new Date() })
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .returning();
    return row;
  },

  async updateRole(userId: string, chatId: string, role: string) {
    const [row] = await db
      .update(chatMember)
      .set({ role })
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .returning();
    return row;
  },

  // --- Pin Management ---

  async togglePin(userId: string, chatId: string) {
    const member = await this.findByUserAndChat(userId, chatId);
    if (!member) return null;

    const [row] = await db
      .update(chatMember)
      .set({
        isPinned: !member.isPinned,
        pinnedAt: !member.isPinned ? new Date() : null,
      })
      .where(eq(chatMember.id, member.id))
      .returning();
    return row;
  },

  async reorderPins(userId: string, orderedChatIds: string[]) {
    const updates = orderedChatIds.map((chatId, idx) =>
      db
        .update(chatMember)
        .set({ pinOrder: idx })
        .where(
          and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)),
        ),
    );
    await Promise.all(updates);
  },

  // --- Read Status ---

  async markAsRead(userId: string, chatId: string) {
    const [row] = await db
      .update(chatMember)
      .set({ lastReadAt: new Date(), unreadCount: 0 })
      .where(and(eq(chatMember.userId, userId), eq(chatMember.chatId, chatId)))
      .returning();
    return row;
  },

  async incrementUnread(chatId: string, excludeUserId?: string) {
    const conditions = [eq(chatMember.chatId, chatId)];
    if (excludeUserId) {
      conditions.push(sql`${chatMember.userId} != ${excludeUserId}`);
    }

    await db
      .update(chatMember)
      .set({ unreadCount: sql`${chatMember.unreadCount} + 1` })
      .where(and(...conditions));
  },

  async getTotalUnread(userId: string): Promise<number> {
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${chatMember.unreadCount}), 0)`,
      })
      .from(chatMember)
      .where(
        and(eq(chatMember.userId, userId), sql`${chatMember.leftAt} IS NULL`),
      );
    return result[0]?.total ?? 0;
  },
};
