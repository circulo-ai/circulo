import { db } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { user as userTable } from "@/db/schema";
import type { RequestServices } from "@/di/di-context";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { Identifier } from "@circulo-ai/core";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = createRouter();
const chatParams = z.object({ id: z.uuid() });
const invitationParams = z.object({ token: z.string().trim().min(1) });
const invitationIdParams = z.object({ id: z.uuid(), invitationId: z.uuid() });

const createInvitationSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member"]).default("member"),
  message: z.string().trim().max(2000).optional(),
});

async function getChatAccess(chatId: string, userId: string, request: Request) {
  const chat = await chatRepo.findById(chatId);
  if (!chat || chat.isDeleted) throw new NotFoundError("Chat not found");

  const membership = await chatMemberRepo.findByUserAndChat(userId, chatId);
  if (!membership)
    throw new ForbiddenError("You are not a member of this chat");

  const organizationManager = await hasPermission(
    "chat",
    "update",
    chat.organizationId,
    await getSession(request),
  );
  const canManage =
    chat.creatorId === userId ||
    membership.role === "owner" ||
    membership.role === "admin" ||
    organizationManager;

  return { chat, membership, canManage };
}

async function getInvitationRecipient(
  token: string,
  userId: string,
  email: string,
  di: RequestServices,
) {
  const invitation = await di.ChatInvitationRepository.findByToken(token);
  if (!invitation) throw new NotFoundError("Chat invitation not found");

  const snap = invitation.snapshot;
  if (snap.status !== "pending" || snap.expiresAt.getTime() <= Date.now()) {
    throw new BadRequestError(
      "This chat invitation has expired or was already used",
    );
  }
  if (snap.email.toLowerCase() !== email.toLowerCase()) {
    throw new ForbiddenError(
      "This invitation was sent to another email address",
    );
  }

  const chat = await chatRepo.findById(snap.chatId.toString());
  if (!chat || chat.isDeleted) throw new NotFoundError("Chat not found");
  if (!(await isMemberOf(userId, chat.organizationId))) {
    throw new ForbiddenError(
      "Join the workspace before accepting this chat invitation",
    );
  }

  return { invitation, chat };
}

router.post(
  "/chat/:id/invitations",
  requireAuth,
  zValidator("param", chatParams),
  zValidator("json", createInvitationSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.var.user!;
    const { chat, membership, canManage } = await getChatAccess(
      id,
      user.id,
      c.req.raw,
    );
    if (!canManage && !membership.canInvite) {
      throw new ForbiddenError(
        "You don't have permission to invite members to this chat",
      );
    }

    const target = await db.query.user.findFirst({
      where: eq(userTable.email, body.email.toLowerCase()),
    });
    if (!target || !(await isMemberOf(target.id, chat.organizationId))) {
      throw new BadRequestError(
        "The invitee must already belong to this workspace",
      );
    }
    if (await chatMemberRepo.isMember(target.id, id)) {
      throw new BadRequestError("That user is already a member of this chat");
    }

    const di: RequestServices = c.di;
    const result = await di.InviteToChatUseCase.execute({
      chatId: id,
      inviterId: user.id,
      email: body.email.toLowerCase(),
      role: body.role,
      message: body.message,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    if (result.isFailure)
      throw new BadRequestError(
        result.getError() ?? "Unable to create chat invitation",
      );
    return c.json(result.getValue(), 201);
  },
);

router.post(
  "/chat-invitations/:token/accept",
  requireAuth,
  zValidator("param", invitationParams),
  async (c) => {
    const { token } = c.req.valid("param");
    const user = c.var.user!;
    const di: RequestServices = c.di;
    const { invitation, chat } = await getInvitationRecipient(
      token,
      user.id,
      user.email,
      di,
    );
    if (await chatMemberRepo.isMember(user.id, chat.id)) {
      return c.json({ chatId: chat.id, alreadyMember: true }, 200);
    }

    const result = await di.AcceptChatInvitationUseCase.execute({
      token: invitation.snapshot.token,
      userId: user.id,
    });
    if (result.isFailure)
      throw new BadRequestError(
        result.getError() ?? "Unable to accept invitation",
      );
    return c.json(result.getValue(), 200);
  },
);

router.post(
  "/chat-invitations/:token/decline",
  requireAuth,
  zValidator("param", invitationParams),
  async (c) => {
    const { token } = c.req.valid("param");
    const user = c.var.user!;
    const di: RequestServices = c.di;
    const { invitation } = await getInvitationRecipient(
      token,
      user.id,
      user.email,
      di,
    );
    invitation.decline();
    await di.ChatInvitationRepository.save(invitation);
    return c.json({ declined: true }, 200);
  },
);

router.delete(
  "/chat/:id/invitations/:invitationId",
  requireAuth,
  zValidator("param", invitationIdParams),
  async (c) => {
    const { id, invitationId } = c.req.valid("param");
    const user = c.var.user!;
    const { canManage } = await getChatAccess(id, user.id, c.req.raw);
    if (!canManage)
      throw new ForbiddenError(
        "You don't have permission to cancel invitations",
      );

    const di: RequestServices = c.di;
    const repository = di.ChatInvitationRepository;
    const invitation = await repository.getById(Identifier.from(invitationId));
    if (!invitation || invitation.snapshot.chatId.toString() !== id) {
      throw new NotFoundError("Chat invitation not found");
    }
    await repository.deleteById(Identifier.from(invitationId));
    return c.json({ deleted: true }, 200);
  },
);

export default router;
