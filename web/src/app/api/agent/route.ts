import { agentRepo } from "@/db/repositories";
import { getUserRole, isMemberOf } from "@/lib/permissions";
import {
  authMiddleware,
  BadRequestError,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server";
import {
  createBodySchema,
  deleteQuerySchema,
  getQuerySchema,
  updateBodySchema,
} from "./schema";
import { resolveOrganizationId } from "./utils";

export const GET = createSafeRoute()
  .use(authMiddleware())
  .query(getQuerySchema)
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const organizationId = await resolveOrganizationId(activeOrganizationId);

    const isOrgMember = await isMemberOf(user.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const search = ctx.query.search?.trim() || undefined;

    if (ctx.query.id) {
      const agent = await agentRepo.findById(ctx.query.id);
      if (!agent || agent.organizationId !== organizationId) {
        throw new NotFoundError("Agent not found");
      }
      return Response.json(agent, { status: 200 });
    }

    const agents = await agentRepo.findByOrganization({
      organizationId,
      search,
      includeArchived: ctx.query.includeArchived,
      limit: ctx.query.limit,
      offset: ctx.query.offset,
    });

    return Response.json(agents, { status: 200 });
  });

export const POST = createSafeRoute()
  .use(authMiddleware())
  .body(createBodySchema)
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const organizationId = await resolveOrganizationId(activeOrganizationId);

    const isOrgMember = await isMemberOf(user.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const [existing] = await agentRepo.findByOrganization({
      organizationId,
    });

    if (existing) {
      if (existing.name === ctx.body.name) {
        throw new BadRequestError(
          "An agent with the same name exists in current organization!",
        );
      }
    }

    const agent = await agentRepo.create({
      id: ctx.body.id,
      organizationId,
      createdBy: user.id,
      name: ctx.body.name,
      description: ctx.body.description,
      instructions: ctx.body.instructions,
      avatarUrl: ctx.body.avatarUrl,
      model: ctx.body.model,
      maxTokens: ctx.body.maxTokens,
      temperature: ctx.body.temperature,
      defaultToolIds: ctx.body.defaultToolIds ?? [],
      defaultKnowledgeBaseIds: ctx.body.defaultKnowledgeBaseIds ?? [],
      metadata: ctx.body.metadata ?? undefined,
    });

    return Response.json(agent, { status: 201 });
  });

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

export const PATCH = createSafeRoute()
  .use(authMiddleware())
  .body(updateBodySchema)
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const organizationId = await resolveOrganizationId(activeOrganizationId);

    const isOrgMember = await isMemberOf(user.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(ctx.body.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    const role = await getUserRole(user.id, organizationId);
    assertCanManageAgent(existingAgent.createdBy, user.id, role);

    const { id, ...updates } = ctx.body;
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

    return Response.json(updatedAgent, { status: 200 });
  });

export const DELETE = createSafeRoute()
  .use(authMiddleware())
  .query(deleteQuerySchema)
  .handler(async (_req, ctx) => {
    const { user, activeOrganizationId } = ctx.data;
    const organizationId = await resolveOrganizationId(activeOrganizationId);

    const isOrgMember = await isMemberOf(user.id, organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this organization");
    }

    const existingAgent = await agentRepo.findById(ctx.query.id);
    if (!existingAgent || existingAgent.organizationId !== organizationId) {
      throw new NotFoundError("Agent not found");
    }

    const role = await getUserRole(user.id, organizationId);
    assertCanManageAgent(existingAgent.createdBy, user.id, role);

    const deletedAgent = ctx.query.hard
      ? await agentRepo.delete(ctx.query.id)
      : await agentRepo.archive(ctx.query.id);

    return Response.json(deletedAgent, { status: 200 });
  });
