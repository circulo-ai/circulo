import {
  agentRepo,
  chatAgentRepo,
  chatMemberRepo,
  chatRepo,
} from "@/db/repositories";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import {
  authMiddleware,
  BadRequestError,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.uuid(),
});

const getQuerySchema = z.object({
  includeDisabled: z.coerce.boolean().optional().default(false),
});

const postBodySchema = z.object({
  agentId: z.uuid(),
  isEnabled: z.coerce.boolean().optional().default(true),
  customInstructions: z.string().nullable().optional(),
  customTemperature: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional(),
});

const patchBodySchema = z
  .object({
    agentId: z.string().uuid(),
    isEnabled: z.boolean().optional(),
    customInstructions: z.string().nullable().optional(),
    customTemperature: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.isEnabled !== undefined ||
      data.customInstructions !== undefined ||
      data.customTemperature !== undefined,
    { message: "At least one field must be provided to update" },
  );

const deleteQuerySchema = z.object({
  agentId: z.uuid(),
});

async function getChatContext(
  chatId: string,
  userId: string,
  activeOrganizationId?: string,
) {
  const chat = await chatRepo.findById(chatId);

  if (!chat || chat.isDeleted) {
    throw new NotFoundError("Chat not found");
  }

  if (activeOrganizationId && chat.organizationId !== activeOrganizationId) {
    throw new ForbiddenError("Chat does not belong to your organization");
  }

  const isOrgMember = await isMemberOf(userId, chat.organizationId);
  if (!isOrgMember) {
    throw new ForbiddenError("You are not a member of this organization");
  }

  const membership = await chatMemberRepo.findByUserAndChat(userId, chatId);
  if (!membership) {
    throw new ForbiddenError("You are not a member of this chat");
  }

  return { chat, membership };
}

async function requireManageAgentsPermission(opts: {
  chat: Awaited<ReturnType<typeof chatRepo.findById>>;
  membership: NonNullable<
    Awaited<ReturnType<typeof chatMemberRepo.findByUserAndChat>>
  >;
  userId: string;
}) {
  const { chat, membership, userId } = opts;

  if (!chat) {
    throw new NotFoundError("Chat not found");
  }

  if (chat.creatorId === userId) return;
  if (membership.canManageAgents) return;

  const canUpdate = await hasPermission("chat", "update", chat.organizationId);
  if (!canUpdate) {
    throw new ForbiddenError(
      "You don't have permission to manage agents in this chat",
    );
  }
}

function normalizeTemperature(
  value: number | null | undefined,
): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value.toString();
}

export const GET = createSafeRoute()
  .params(paramsSchema)
  .query(getQuerySchema)
  .use(authMiddleware())
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const { chat } = await getChatContext(
      ctx.params.id,
      user.id,
      activeOrganizationId,
    );

    const agents = await chatAgentRepo.findForChat(chat.id, {
      includeDisabled: ctx.query.includeDisabled,
    });

    return Response.json(agents, { status: 200 });
  });

export const POST = createSafeRoute()
  .params(paramsSchema)
  .body(postBodySchema)
  .use(authMiddleware())
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const { chat, membership } = await getChatContext(
      ctx.params.id,
      user.id,
      activeOrganizationId,
    );

    await requireManageAgentsPermission({ chat, membership, userId: user.id });

    const agent = await agentRepo.findById(ctx.body.agentId);
    if (!agent) {
      throw new NotFoundError("Agent not found");
    }

    if (agent.organizationId !== chat.organizationId) {
      throw new ForbiddenError("Agent belongs to a different organization");
    }

    const existing = await chatAgentRepo.findAgentInChat(
      ctx.body.agentId,
      chat.id,
    );
    const normalizedTemp = normalizeTemperature(ctx.body.customTemperature);

    if (existing) {
      const updateData: Record<string, any> = {
        isEnabled: ctx.body.isEnabled ?? true,
      };

      if (ctx.body.customInstructions !== undefined) {
        updateData.customInstructions = ctx.body.customInstructions;
      }
      if (normalizedTemp !== undefined) {
        updateData.customTemperature = normalizedTemp;
      }

      const updated = await chatAgentRepo.update(existing.id, updateData);
      return Response.json(updated ?? existing, { status: 200 });
    }

    const created = await chatAgentRepo.create({
      chatId: chat.id,
      agentId: ctx.body.agentId,
      addedBy: user.id,
      isEnabled: ctx.body.isEnabled ?? true,
      customInstructions: ctx.body.customInstructions ?? null,
      customTemperature: normalizedTemp ?? null,
    });

    return Response.json(created, { status: 201 });
  });

export const PATCH = createSafeRoute()
  .params(paramsSchema)
  .body(patchBodySchema)
  .use(authMiddleware())
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const { chat, membership } = await getChatContext(
      ctx.params.id,
      user.id,
      activeOrganizationId,
    );

    await requireManageAgentsPermission({ chat, membership, userId: user.id });

    const link = await chatAgentRepo.findAgentInChat(ctx.body.agentId, chat.id);
    if (!link) {
      throw new NotFoundError("Agent not found in this chat");
    }

    const updateData: Record<string, any> = {};
    if (ctx.body.isEnabled !== undefined)
      updateData.isEnabled = ctx.body.isEnabled;
    if (ctx.body.customInstructions !== undefined)
      updateData.customInstructions = ctx.body.customInstructions;

    const normalizedTemp = normalizeTemperature(ctx.body.customTemperature);
    if (normalizedTemp !== undefined)
      updateData.customTemperature = normalizedTemp;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("No fields to update");
    }

    const updated = await chatAgentRepo.update(link.id, updateData);
    if (!updated) {
      throw new NotFoundError("Agent link not found");
    }

    return Response.json(updated, { status: 200 });
  });

export const DELETE = createSafeRoute()
  .params(paramsSchema)
  .query(deleteQuerySchema)
  .use(authMiddleware())
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const { chat, membership } = await getChatContext(
      ctx.params.id,
      user.id,
      activeOrganizationId,
    );

    await requireManageAgentsPermission({ chat, membership, userId: user.id });

    const deleted = await chatAgentRepo.deleteByChatAndAgent(
      chat.id,
      ctx.query.agentId,
    );

    if (!deleted) {
      throw new NotFoundError("Agent not found in this chat");
    }

    return Response.json(deleted, { status: 200 });
  });
