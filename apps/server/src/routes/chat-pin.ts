import { db } from "@/db";
import { chatMember } from "@/db/schema/chat";
import { createRouter } from "@/lib/create-app";
import { ForbiddenError } from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { and, eq, gte, sql } from "drizzle-orm";
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

const paramsSchema = z.object({ id: z.string() });
const pinBodySchema = z
  .object({
    pinOrder: z.coerce.number().int().min(0).optional(),
  })
  .optional();

const router = createRouter();

router.post("/chat/:id/pin", requireAuth, async (c) => {
  const parseParams = paramsSchema.safeParse(c.req.param());
  if (!parseParams.success) {
    return c.json({ error: "Invalid chat id" }, 400);
  }
  const { id: chatId } = parseParams.data;
  const { user } = c.var;

  let body: z.infer<typeof pinBodySchema> = undefined;
  try {
    body = pinBodySchema.parse(await c.req.json());
  } catch {
    body = undefined;
  }

  const memberRows = await db
    .select({ id: chatMember.id, isPinned: chatMember.isPinned })
    .from(chatMember)
    .where(and(eq(chatMember.chatId, chatId), eq(chatMember.userId, user!.id)))
    .limit(1);

  if (memberRows.length === 0) {
    throw new ForbiddenError("Not a member of this chat");
  }

  const desiredOrder = body?.pinOrder;
  const desiredIsPinned = !memberRows[0].isPinned;

  const result: PinChatResponse = await db.transaction(async (tx) => {
    let insertOrder: number;
    if (typeof desiredOrder === "number") {
      insertOrder = desiredOrder;
      await tx
        .update(chatMember)
        .set({ pinOrder: sql`${chatMember.pinOrder} + 1` })
        .where(
          and(
            eq(chatMember.userId, user!.id),
            eq(chatMember.isPinned, desiredIsPinned),
            gte(chatMember.pinOrder, insertOrder),
          ),
        );
    } else {
      insertOrder = 0;
      await tx
        .update(chatMember)
        .set({ pinOrder: sql`${chatMember.pinOrder} + 1` })
        .where(
          and(
            eq(chatMember.userId, user!.id),
            eq(chatMember.isPinned, desiredIsPinned),
            gte(chatMember.pinOrder, insertOrder),
          ),
        );
    }

    const [updated] = await tx
      .update(chatMember)
      .set({
        isPinned: desiredIsPinned,
        pinnedAt: new Date(),
        pinOrder: insertOrder,
      })
      .where(
        and(eq(chatMember.chatId, chatId), eq(chatMember.userId, user!.id)),
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

  return c.json(result);
});

export default router;
