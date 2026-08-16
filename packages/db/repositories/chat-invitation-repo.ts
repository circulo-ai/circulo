import { randomBytes } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { DbInstance } from "../index";
import { chatInvitation, chatMember } from "../schema";

export function createChatInvitationRepository(database: DbInstance) {
  const db = database;
  return {
    async findById(id: string) {
      return db.query.chatInvitation.findFirst({
        where: eq(chatInvitation.id, id),
      });
    },

    async findByToken(token: string) {
      return db.query.chatInvitation.findFirst({
        where: eq(chatInvitation.token, token),
        with: { chat: true, inviter: true },
      });
    },

    async create(data: Omit<typeof chatInvitation.$inferInsert, "token">) {
      const token = randomBytes(32).toString("hex");
      const [row] = await db
        .insert(chatInvitation)
        .values({ ...data, token })
        .returning();
      return row;
    },

    async update(
      id: string,
      data: Partial<typeof chatInvitation.$inferInsert>,
    ) {
      const [row] = await db
        .update(chatInvitation)
        .set(data)
        .where(eq(chatInvitation.id, id))
        .returning();
      return row;
    },

    async delete(id: string) {
      const [row] = await db
        .delete(chatInvitation)
        .where(eq(chatInvitation.id, id))
        .returning();
      return row;
    },

    // --- Query Methods ---

    async findForChat(chatId: string, opts?: { status?: string }) {
      const conditions = [eq(chatInvitation.chatId, chatId)];
      if (opts?.status) {
        conditions.push(eq(chatInvitation.status, opts.status as any));
      }

      return db.query.chatInvitation.findMany({
        where: and(...conditions),
        with: { inviter: true, invitee: true },
        orderBy: sql`created_at desc`,
      });
    },

    async findPendingForEmail(email: string) {
      return db.query.chatInvitation.findMany({
        where: and(
          eq(chatInvitation.email, email),
          eq(chatInvitation.status, "pending"),
          gt(chatInvitation.expiresAt, new Date()),
        ),
        with: { chat: true, inviter: true },
      });
    },

    async findPendingForUser(userId: string) {
      return db.query.chatInvitation.findMany({
        where: and(
          eq(chatInvitation.inviteeId, userId),
          eq(chatInvitation.status, "pending"),
          gt(chatInvitation.expiresAt, new Date()),
        ),
        with: { chat: true, inviter: true },
      });
    },

    // --- Invitation Actions ---

    async accept(token: string, userId: string) {
      const invitation = await this.findByToken(token);
      if (!invitation) return { error: "Invitation not found" };
      if (invitation.status !== "pending")
        return { error: "Invitation already processed" };
      if (new Date() > invitation.expiresAt)
        return { error: "Invitation expired" };

      // Update invitation status
      await db
        .update(chatInvitation)
        .set({ status: "accepted", acceptedAt: new Date(), inviteeId: userId })
        .where(eq(chatInvitation.id, invitation.id));

      // Add user as chat member
      const [member] = await db
        .insert(chatMember)
        .values({
          chatId: invitation.chatId,
          userId,
          role: invitation.role ?? "member",
        })
        .onConflictDoUpdate({
          target: [chatMember.chatId, chatMember.userId],
          set: { leftAt: null, joinedAt: new Date() },
        })
        .returning();

      return { member, invitation };
    },

    async decline(token: string) {
      const invitation = await this.findByToken(token);
      if (!invitation) return null;

      const [row] = await db
        .update(chatInvitation)
        .set({ status: "declined" })
        .where(eq(chatInvitation.id, invitation.id))
        .returning();
      return row;
    },

    async expireOld() {
      const result = await db
        .update(chatInvitation)
        .set({ status: "expired" })
        .where(
          and(
            eq(chatInvitation.status, "pending"),
            sql`${chatInvitation.expiresAt} < NOW()`,
          ),
        )
        .returning();
      return result.length;
    },

    async revoke(id: string, inviterId: string) {
      const [row] = await db
        .delete(chatInvitation)
        .where(
          and(
            eq(chatInvitation.id, id),
            eq(chatInvitation.inviterId, inviterId),
            eq(chatInvitation.status, "pending"),
          ),
        )
        .returning();
      return row;
    },
  };
}
