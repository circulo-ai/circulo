import { db } from "@/db";
import { chatMember } from "@/db/schema/chat";
import { api, Errors, success } from "@/lib/server";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { z } from "zod";

export type PinChatResponse = {
  pinInfo?: {
    chatId: string;
    userId: string;
    isPinned: boolean;
    pinnedAt?: Date;
    pinOrder?: number;
  };
};

export const POST = api(
  {
    params: z.object({ id: z.string() }),
    body: z
      .object({ pinOrder: z.coerce.number().int().min(0).optional() })
      .optional(),
    auth: true,
  },
  async (req, ctx) => {
    const memberRows = await db
      .select({ id: chatMember.id })
      .from(chatMember)
      .where(
        and(
          eq(chatMember.chatId, ctx.params.id),
          eq(chatMember.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (memberRows.length === 0) {
      throw Errors.forbidden("Not a member of this chat");
    }

    const desiredOrder = ctx.body?.pinOrder;

    const result: PinChatResponse = await db.transaction(async (tx) => {
      // Determine insertion order
      let insertOrder: number;
      if (typeof desiredOrder === "number") {
        insertOrder = desiredOrder;
        // Shift existing pins at or after desired position
        await tx
          .update(chatMember)
          .set({
            pinOrder: sql`${chatMember.pinOrder}
            + 1`,
          })
          .where(
            and(
              eq(chatMember.userId, ctx.user.id),
              eq(chatMember.isPinned, true),
              gte(chatMember.pinOrder, insertOrder),
            ),
          );
      } else {
        // Insert at top (order 0) and shift existing pins down
        insertOrder = 0;
        await tx
          .update(chatMember)
          .set({ pinOrder: sql`${chatMember.pinOrder} + 1` })
          .where(
            and(
              eq(chatMember.userId, ctx.user.id),
              eq(chatMember.isPinned, true),
              gte(chatMember.pinOrder, insertOrder),
            ),
          );
      }

      const [updated] = await tx
        .update(chatMember)
        .set({
          isPinned: true,
          pinnedAt: new Date(),
          pinOrder: insertOrder,
        })
        .where(
          and(
            eq(chatMember.chatId, ctx.params.id),
            eq(chatMember.userId, ctx.user.id),
          ),
        )
        .returning({
          id: chatMember.id,
          chatId: chatMember.chatId,
          userId: chatMember.userId,
          isPinned: chatMember.isPinned,
          pinnedAt: chatMember.pinnedAt,
          pinOrder: chatMember.pinOrder,
        });

      return {
        pinInfo: {
          chatId: updated.chatId,
          userId: updated.userId,
          isPinned: updated.isPinned,
          pinnedAt: updated.pinnedAt ?? undefined,
          pinOrder: updated.pinOrder ?? undefined,
        },
      };
    });

    return success(result);
  },
);

export const DELETE = api(
  {
    params: z.object({ id: z.string() }),
    auth: true,
  },
  async (req, ctx) => {
    const existing = await db
      .select({ pinOrder: chatMember.pinOrder, isPinned: chatMember.isPinned })
      .from(chatMember)
      .where(
        and(
          eq(chatMember.chatId, ctx.params.id),
          eq(chatMember.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw Errors.forbidden("Not a member of this chat");
    }

    const currentOrder = existing[0].pinOrder;

    await db.transaction(async (tx) => {
      // Unpin current
      await tx
        .update(chatMember)
        .set({ isPinned: false, pinnedAt: null, pinOrder: null })
        .where(
          and(
            eq(chatMember.chatId, ctx.params.id),
            eq(chatMember.userId, ctx.user.id),
          ),
        );

      if (typeof currentOrder === "number") {
        // Compact orders: shift down all pins after current
        await tx
          .update(chatMember)
          .set({
            pinOrder: sql`${chatMember.pinOrder} - 1`,
          })
          .where(
            and(
              eq(chatMember.userId, ctx.user.id),
              eq(chatMember.isPinned, true),
              gt(chatMember.pinOrder, currentOrder),
            ),
          );
      }
    });

    return success({});
  },
);
