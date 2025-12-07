import {
  agentRepo,
  chatAgentRepo,
  chatMemberRepo,
  chatRepo,
} from "@/db/repositories";
import { getUserRole, hasPermission, isMemberOf } from "@/lib/permissions";
import { createRouter } from "@/lib/create-app";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
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
    agentId: z.uuid(),
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
): number | null | undefined {
  if (value === null) return null;
  return value;
}

const router = createRouter();

router.get(
  "/chat/:id/agent",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("query", getQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const params = c.req.valid("param");
    const query = c.req.valid("query");

    const { chat } = await getChatContext(params.id, user!.id, activeOrgId);

    const agents = await chatAgentRepo.findForChat(chat.id, {
      includeDisabled: query.includeDisabled,
    });

    return c.json(agents, 200);
  },
);

router.post(
  "/chat/:id/agent",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", postBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const params = c.req.valid("param");
    const body = c.req.valid("json");

    const { chat, membership } = await getChatContext(
      params.id,
      user!.id,
      activeOrgId,
    );

    await requireManageAgentsPermission({
      chat,
      membership,
      userId: user!.id,
    });

    const agent = await agentRepo.findById(body.agentId);
    if (!agent) {
      throw new NotFoundError("Agent not found");
    }

    if (agent.organizationId !== chat.organizationId) {
      throw new ForbiddenError("Agent belongs to a different organization");
    }

    const existing = await chatAgentRepo.findAgentInChat(body.agentId, chat.id);
    const normalizedTemp = normalizeTemperature(body.customTemperature);

    if (existing) {
      const updateData: Record<string, any> = {
        isEnabled: body.isEnabled ?? true,
      };

      if (body.customInstructions !== undefined) {
        updateData.customInstructions = body.customInstructions;
      }
      if (normalizedTemp !== undefined) {
        updateData.customTemperature = normalizedTemp;
      }

      const updated = await chatAgentRepo.update(existing.id, updateData);
      return c.json(updated ?? existing, 200);
    }

    const created = await chatAgentRepo.create({
      chatId: chat.id,
      agentId: body.agentId,
      addedBy: user!.id,
      isEnabled: body.isEnabled ?? true,
      customInstructions: body.customInstructions ?? null,
      customTemperature: normalizedTemp ?? null,
    });

    return c.json(created, 201);
  },
);

router.patch(
  "/chat/:id/agent",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", patchBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const params = c.req.valid("param");
    const body = c.req.valid("json");

    const { chat, membership } = await getChatContext(
      params.id,
      user!.id,
      activeOrgId,
    );

    await requireManageAgentsPermission({ chat, membership, userId: user!.id });

    const link = await chatAgentRepo.findAgentInChat(body.agentId, chat.id);
    if (!link) {
      throw new NotFoundError("Agent not found in this chat");
    }

    const updateData: Record<string, any> = {};
    if (body.isEnabled !== undefined) updateData.isEnabled = body.isEnabled;
    if (body.customInstructions !== undefined)
      updateData.customInstructions = body.customInstructions;

    const normalizedTemp = normalizeTemperature(body.customTemperature);
    if (normalizedTemp !== undefined)
      updateData.customTemperature = normalizedTemp;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("No fields to update");
    }

    const updated = await chatAgentRepo.update(link.id, updateData);
    if (!updated) {
      throw new NotFoundError("Agent link not found");
    }

    return c.json(updated, 200);
  },
);

router.delete(
  "/chat/:id/agent",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("query", deleteQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const params = c.req.valid("param");
    const query = c.req.valid("query");

    const { chat, membership } = await getChatContext(
      params.id,
      user!.id,
      activeOrgId,
    );

    await requireManageAgentsPermission({ chat, membership, userId: user!.id });

    const deleted = await chatAgentRepo.deleteByChatAndAgent(
      chat.id,
      query.agentId,
    );

    if (!deleted) {
      throw new NotFoundError("Agent not found in this chat");
    }

    return c.json(deleted, 200);
  },
);

export default router;
