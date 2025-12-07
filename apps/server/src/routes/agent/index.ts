import { agentRepo } from "@/db/repositories";
import { getUserRole, hasPermission, isMemberOf } from "@/lib/permissions";
import { createRouter } from "@/lib/create-app";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import {
  createBodySchema,
  deleteQuerySchema,
  getQuerySchema,
  updateBodySchema,
} from "@circulo-ai/types";
import { resolveOrganizationId } from "./utils";

const router = createRouter();

router.get(
  "/agent",
  requireAuth,
  zValidator("query", getQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const query = c.req.valid("query");
    const organizationId = await resolveOrganizationId(
      activeOrgId,
      c.req.raw,
    );

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
  zValidator("json", createBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const body = c.req.valid("json");
    const organizationId = await resolveOrganizationId(
      activeOrgId,
      c.req.raw,
    );

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const [existing] = await agentRepo.findByOrganization({
      organizationId,
    });

    if (existing && existing.name === body.name) {
      throw new BadRequestError(
        "An agent with the same name exists in current organization!",
      );
    }

    const agent = await agentRepo.create({
      id: body.id,
      organizationId,
      createdBy: user!.id,
      name: body.name,
      description: body.description,
      instructions: body.instructions,
      avatarUrl: body.avatarUrl,
      model: body.model,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      defaultToolIds: body.defaultToolIds ?? [],
      defaultKnowledgeBaseIds: body.defaultKnowledgeBaseIds ?? [],
      metadata: body.metadata ?? undefined,
    });

    return c.json(agent, 201);
  },
);

function assertCanManageAgent(
  agentCreatorId: string,
  userId: string,
  role: string | null,
) {
  const isAdmin = role === "owner" || role === "admin";
  if (agentCreatorId !== userId && !isAdmin) {
    throw new ForbiddenError("You don't have permission to modify this agent");
  }
}

router.patch(
  "/agent",
  requireAuth,
  zValidator("json", updateBodySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const body = c.req.valid("json");
    const organizationId = await resolveOrganizationId(
      activeOrgId,
      c.req.raw,
    );

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(body.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    const role = await getUserRole(user!.id, organizationId);
    assertCanManageAgent(existingAgent.createdBy, user!.id, role);

    const { id, ...updates } = body;
    const updateData: Parameters<typeof agentRepo.update>[1] = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.instructions !== undefined)
      updateData.instructions = updates.instructions;
    if (updates.avatarUrl !== undefined)
      updateData.avatarUrl = updates.avatarUrl;
    if (updates.model !== undefined) updateData.model = updates.model;
    if (updates.maxTokens !== undefined)
      updateData.maxTokens = updates.maxTokens;
    if (updates.temperature !== undefined)
      updateData.temperature = updates.temperature;
    if (updates.defaultToolIds !== undefined)
      updateData.defaultToolIds = updates.defaultToolIds;
    if (updates.defaultKnowledgeBaseIds !== undefined)
      updateData.defaultKnowledgeBaseIds = updates.defaultKnowledgeBaseIds;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const updatedAgent = await agentRepo.update(id, updateData);
    if (!updatedAgent) {
      throw new NotFoundError("Agent not found");
    }

    return c.json(updatedAgent, 200);
  },
);

router.delete(
  "/agent",
  requireAuth,
  zValidator("query", deleteQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const query = c.req.valid("query");
    const organizationId = await resolveOrganizationId(
      activeOrgId,
      c.req.raw,
    );

    const isOrgMember = await isMemberOf(user!.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(query.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    const role = await getUserRole(user!.id, organizationId);
    assertCanManageAgent(existingAgent.createdBy, user!.id, role);

    const deletedAgent = query.hard
      ? await agentRepo.delete(query.id)
      : await agentRepo.archive(query.id);

    return c.json(deletedAgent, 200);
  },
);

export default router;
