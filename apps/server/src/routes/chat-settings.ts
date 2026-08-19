import { chatMember, db, user } from "@/db";
import {
  agentRepo,
  chatAgentRepo,
  chatMemberRepo,
  chatRepo,
} from "@/db/repositories";
import { knowledgeBase } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const router = createRouter();
const paramsSchema = z.object({ id: z.uuid() });
const memberParamsSchema = z.object({ id: z.uuid(), memberId: z.uuid() });

const settingsSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    instructions: z.string().trim().max(12000).nullable().optional(),
    knowledgeBaseIds: z.array(z.uuid()).max(50).optional(),
    visibility: z.enum(["private", "public"]).optional(),
    orchestrationEnabled: z.boolean().optional(),
    orchestrationAgentId: z.uuid().nullable().optional(),
    orchestrationModel: z.string().trim().min(1).max(200).optional(),
    orchestrationFallbackModel: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No settings to update");

const addMemberSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.email().optional(),
    role: z.enum(["admin", "member"]).optional().default("member"),
    canInvite: z.boolean().optional().default(false),
    canManageAgents: z.boolean().optional().default(false),
    canManageKnowledge: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.userId || value.email), {
    message: "userId or email is required",
  });

const updateMemberSchema = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    canInvite: z.boolean().optional(),
    canManageAgents: z.boolean().optional(),
    canManageKnowledge: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "No member changes provided",
  );

async function getChatAccess(chatId: string, userId: string, request: Request) {
  const chat = await chatRepo.findById(chatId);
  if (!chat || chat.isDeleted) throw new NotFoundError("Chat not found");

  const organizationMember = await isMemberOf(userId, chat.organizationId);
  if (!organizationMember) {
    throw new ForbiddenError("You don't have access to this organization");
  }

  const membership = await chatMemberRepo.findByUserAndChat(userId, chatId);
  if (!membership)
    throw new ForbiddenError("You are not a member of this chat");

  const session = await getSession(request);
  const organizationManager = await hasPermission(
    "chat",
    "update",
    chat.organizationId,
    session,
  );
  const canManage =
    chat.creatorId === userId ||
    membership.role === "owner" ||
    membership.role === "admin" ||
    organizationManager;

  return {
    chat,
    membership,
    canManage,
    canManageKnowledge: canManage || membership.canManageKnowledge,
  };
}

router.get(
  "/chat/:id/settings",
  requireAuth,
  zValidator("param", paramsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { user } = c.var;
    const { chat, membership, canManage, canManageKnowledge } =
      await getChatAccess(id, user!.id, c.req.raw);
    const members = await chatMemberRepo.findForChat(id);
    const agents = await chatAgentRepo.findForChat(id, {
      includeDisabled: true,
    });

    return c.json({
      access: {
        currentUserId: user!.id,
        canManageChat: canManage,
        canInviteMembers: canManage || membership.canInvite,
        canManageAgents: canManage || membership.canManageAgents,
        canManageKnowledge,
      },
      chat: {
        id: chat.id,
        title: chat.title,
        description: chat.description,
        instructions: chat.instructions,
        knowledgeBaseIds: chat.knowledgeBaseIds ?? [],
        visibility: chat.visibility,
        type: chat.type,
        orchestrationEnabled: chat.orchestrationEnabled,
        orchestrationAgentId: chat.orchestrationAgentId,
        orchestrationModel: chat.orchestrationModel,
        orchestrationFallbackModel: chat.orchestrationFallbackModel,
        creatorId: chat.creatorId,
      },
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        canInvite: member.canInvite,
        canManageAgents: member.canManageAgents,
        canManageKnowledge: member.canManageKnowledge,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              image: member.user.image,
            }
          : null,
      })),
      agents: agents.map((link) => ({
        id: link.id,
        agentId: link.agentId,
        isEnabled: link.isEnabled,
        customInstructions: link.customInstructions,
        customTemperature: link.customTemperature,
        agent: link.agent,
      })),
    });
  },
);

router.patch(
  "/chat/:id/settings",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", settingsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { user } = c.var;
    const { chat, canManage, canManageKnowledge } = await getChatAccess(
      id,
      user!.id,
      c.req.raw,
    );
    const fields = Object.keys(body);
    const isKnowledgeOnly = fields.every(
      (field) => field === "knowledgeBaseIds",
    );
    if (!canManage && !(canManageKnowledge && isKnowledgeOnly))
      throw new ForbiddenError("You don't have permission to update this chat");

    if (body.knowledgeBaseIds) {
      const bases = await db
        .select({ id: knowledgeBase.id })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.organizationId, chat.organizationId),
            eq(knowledgeBase.isArchived, false),
            inArray(knowledgeBase.id, body.knowledgeBaseIds),
          ),
        );
      if (bases.length !== new Set(body.knowledgeBaseIds).size) {
        throw new BadRequestError(
          "Every knowledge base must belong to this workspace",
        );
      }
    }

    if (body.orchestrationAgentId) {
      const orchestrationAgent = await agentRepo.findById(
        body.orchestrationAgentId,
      );
      if (
        !orchestrationAgent ||
        orchestrationAgent.organizationId !== chat.organizationId ||
        orchestrationAgent.isArchived
      ) {
        throw new BadRequestError(
          "The orchestration agent must belong to this workspace and be active",
        );
      }
    }

    const updated = await chatRepo.update(id, body);
    if (!updated) throw new NotFoundError("Chat not found");
    return c.json(updated);
  },
);

router.post(
  "/chat/:id/members",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", addMemberSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { user } = c.var;
    const { chat, membership, canManage } = await getChatAccess(
      id,
      user!.id,
      c.req.raw,
    );
    if (!canManage && !membership.canInvite) {
      throw new ForbiddenError("You don't have permission to add chat members");
    }

    if (
      !canManage &&
      (body.role === "admin" ||
        body.canInvite ||
        body.canManageAgents ||
        body.canManageKnowledge)
    ) {
      throw new ForbiddenError(
        "Only chat managers can assign roles or member permissions",
      );
    }

    const target = body.userId
      ? await db.query.user.findFirst({ where: eq(userTable.id, body.userId) })
      : await db.query.user.findFirst({
          where: eq(userTable.email, body.email!),
        });
    if (!target) throw new NotFoundError("User not found");
    if (!(await isMemberOf(target.id, chat.organizationId))) {
      throw new BadRequestError("The user must belong to this workspace first");
    }
    if (await chatMemberRepo.findByUserAndChat(target.id, id)) {
      throw new BadRequestError("That user is already a member of this chat");
    }

    const added = await db
      .insert(chatMember)
      .values({
        chatId: id,
        userId: target.id,
        role: body.role,
        canInvite: body.canInvite,
        canManageAgents: body.canManageAgents,
        canManageKnowledge: body.canManageKnowledge,
        leftAt: null,
      })
      .onConflictDoUpdate({
        target: [chatMember.chatId, chatMember.userId],
        set: {
          role: body.role,
          canInvite: body.canInvite,
          canManageAgents: body.canManageAgents,
          canManageKnowledge: body.canManageKnowledge,
          leftAt: null,
          joinedAt: new Date(),
        },
      })
      .returning();

    return c.json({ member: added[0] }, 201);
  },
);

router.patch(
  "/chat/:id/members/:memberId",
  requireAuth,
  zValidator("param", memberParamsSchema),
  zValidator("json", updateMemberSchema),
  async (c) => {
    const { id, memberId } = c.req.valid("param");
    const body = c.req.valid("json");
    const { user } = c.var;
    const { canManage } = await getChatAccess(id, user!.id, c.req.raw);
    if (!canManage)
      throw new ForbiddenError(
        "You don't have permission to update chat members",
      );

    const target = await chatMemberRepo.findById(memberId);
    if (!target || target.chatId !== id || target.leftAt) {
      throw new NotFoundError("Chat member not found");
    }
    if (target.role === "owner")
      throw new ForbiddenError("The chat owner cannot be demoted");

    const [updated] = await db
      .update(chatMember)
      .set(body)
      .where(and(eq(chatMember.id, memberId), eq(chatMember.chatId, id)))
      .returning();
    return c.json({ member: updated });
  },
);

router.delete(
  "/chat/:id/members/:memberId",
  requireAuth,
  zValidator("param", memberParamsSchema),
  async (c) => {
    const { id, memberId } = c.req.valid("param");
    const { user } = c.var;
    const { canManage } = await getChatAccess(id, user!.id, c.req.raw);
    const target = await chatMemberRepo.findById(memberId);
    if (!target || target.chatId !== id || target.leftAt) {
      throw new NotFoundError("Chat member not found");
    }

    const isSelf = target.userId === user!.id;
    if (!isSelf && !canManage) {
      throw new ForbiddenError(
        "You don't have permission to remove chat members",
      );
    }
    if (target.role === "owner")
      throw new ForbiddenError("The chat owner cannot be removed");

    const [removed] = await db
      .update(chatMember)
      .set({ leftAt: new Date() })
      .where(
        and(eq(chatMember.id, memberId), sql`${chatMember.leftAt} IS NULL`),
      )
      .returning();
    return c.json({ member: removed });
  },
);

export default router;

// Keep the schema table alias explicit so the access-control code remains readable.
const userTable = user;
