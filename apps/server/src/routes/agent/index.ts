import { db } from "@/db";
import { agentRepo } from "@/db/repositories";
import { agent, knowledgeBase } from "@/db/schema";
import { requireProviderCredential } from "@/lib/ai/provider-registry";
import { enforceOrganizationFeatureLimit } from "@/lib/billing/limits";
import { createRouter } from "@/lib/create-app";
import {
  hasPermissionForUser,
  isMemberOf,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { NotFoundError } from "@circulo-ai/core";
import {
  BadRequestError,
  createAgentBodySchema,
  deleteAgentParamsSchema,
  deleteAgentQuerySchema,
  ForbiddenError,
  getAgentQuerySchema,
  updateAgentBodySchema,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray } from "drizzle-orm";
import { resolveOrganizationId } from "../utils";

const router = createRouter();

router.get(
  "/agent",
  requireAuth,
  zValidator("query", getAgentQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const query = c.req.valid("query");
    const organizationId = await resolveOrganizationId(activeOrgId, c.req.raw);

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const search = query.search?.trim() || undefined;

    if (query.id) {
      const agent = await agentRepo.findById(query.id);
      if (!agent || agent.organizationId !== organizationId) {
        throw new NotFoundError("Agent not found");
      }
      return c.json(agent, 200);
    }

    const agents = await agentRepo.findByOrganization({
      organizationId,
      search,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(agents, 200);
  },
);

router.post(
  "/agent",
  requireAuth,
  zValidator("json", createAgentBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const body = c.req.valid("json");
    const organizationId = await resolveOrganizationId(activeOrgId, c.req.raw);

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }
    if (
      !(await hasPermissionForUser(
        user!.id,
        organizationId,
        "agents",
        "create",
        c.var.apiKeyPermissions,
      ))
    ) {
      throw new ForbiddenError(
        "Only workspace owners and admins can create agents",
      );
    }

    try {
      await requireProviderCredential(body.providerId, user!.id);
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error
          ? error.message
          : "AI provider is not configured",
      );
    }

    const existing = await agentRepo.findByName(organizationId, body.name);
    if (existing) {
      throw new BadRequestError(
        "An agent with the same name exists in this organization",
      );
    }

    const [agentCount] = await db
      .select({ current: count() })
      .from(agent)
      .where(
        and(
          eq(agent.organizationId, organizationId),
          eq(agent.isArchived, false),
        ),
      );
    await enforceOrganizationFeatureLimit({
      organizationId,
      feature: "max_agents",
      current: Number(agentCount?.current ?? 0),
      resourceName: "Agent",
    });

    try {
      const agent = await agentRepo.create({
        id: body.id,
        organizationId,
        createdBy: user!.id,
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        avatarUrl: body.avatarUrl,
        providerId: body.providerId,
        model: body.model,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
        toolAccessMode: body.toolAccessMode ?? "allowlist",
        defaultToolIds: body.defaultToolIds ?? [],
        defaultKnowledgeBaseIds: body.defaultKnowledgeBaseIds ?? [],
        metadata: body.metadata ?? undefined,
      });

      return c.json(agent, 201);
    } catch (error) {
      const message =
        error instanceof Error &&
        "code" in error &&
        (error as any).code === "23505"
          ? "An agent with the same name exists in this organization"
          : error instanceof Error
            ? error.message
            : "Unable to create agent";
      throw new BadRequestError(message);
    }
  },
);

async function assertCanManageAgent(
  agentCreatorId: string,
  userId: string,
  organizationId: string,
  apiKeyPermissions?: ApiKeyPermissions,
) {
  const canManage = await hasPermissionForUser(
    userId,
    organizationId,
    "agents",
    "update",
    apiKeyPermissions,
  );
  if (agentCreatorId !== userId && !canManage) {
    throw new ForbiddenError("You don't have permission to modify this agent");
  }
}

router.patch(
  "/agent",
  requireAuth,
  zValidator("json", updateAgentBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const body = c.req.valid("json");
    const organizationId = await resolveOrganizationId(activeOrgId, c.req.raw);

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(body.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    await assertCanManageAgent(
      existingAgent.createdBy,
      user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );

    const { id, ...updates } = body;

    if (updates.providerId !== undefined) {
      try {
        await requireProviderCredential(updates.providerId, user!.id);
      } catch (error) {
        throw new BadRequestError(
          error instanceof Error
            ? error.message
            : "AI provider is not configured",
        );
      }
    }

    if (updates.defaultKnowledgeBaseIds !== undefined) {
      const ids = updates.defaultKnowledgeBaseIds;
      const bases =
        ids.length === 0
          ? []
          : await db
              .select({ id: knowledgeBase.id })
              .from(knowledgeBase)
              .where(
                and(
                  eq(knowledgeBase.organizationId, organizationId),
                  eq(knowledgeBase.isArchived, false),
                  inArray(knowledgeBase.id, ids),
                ),
              );
      if (bases.length !== new Set(ids).size) {
        throw new BadRequestError(
          "Every knowledge base must belong to this workspace",
        );
      }
    }

    const updateData: Parameters<typeof agentRepo.update>[1] = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.instructions !== undefined)
      updateData.instructions = updates.instructions;
    if (updates.avatarUrl !== undefined)
      updateData.avatarUrl = updates.avatarUrl;
    if (updates.providerId !== undefined)
      updateData.providerId = updates.providerId;
    if (updates.model !== undefined) updateData.model = updates.model;
    if (updates.maxTokens !== undefined)
      updateData.maxTokens = updates.maxTokens;
    if (updates.temperature !== undefined)
      updateData.temperature = updates.temperature;
    if (updates.toolAccessMode !== undefined)
      updateData.toolAccessMode = updates.toolAccessMode;
    if (updates.defaultToolIds !== undefined)
      updateData.defaultToolIds = updates.defaultToolIds;
    if (updates.defaultKnowledgeBaseIds !== undefined)
      updateData.defaultKnowledgeBaseIds = updates.defaultKnowledgeBaseIds;
    if (updates.metadata !== undefined)
      updateData.metadata = updates.metadata ?? undefined;

    const updatedAgent = await agentRepo.update(id, updateData);
    if (!updatedAgent) {
      throw new NotFoundError("Agent not found");
    }

    return c.json(updatedAgent, 200);
  },
);

router.delete(
  "/agent/:id",
  requireAuth,
  zValidator("param", deleteAgentParamsSchema),
  zValidator("query", deleteAgentQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const params = c.req.valid("param");
    const query = c.req.valid("query");
    const organizationId = await resolveOrganizationId(activeOrgId, c.req.raw);

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(params.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    await assertCanManageAgent(
      existingAgent.createdBy,
      user!.id,
      organizationId,
      c.var.apiKeyPermissions,
    );

    const deletedAgent = query.hard
      ? await agentRepo.delete(params.id)
      : await agentRepo.archive(params.id);

    return c.json(deletedAgent, 200);
  },
);

export default router;
