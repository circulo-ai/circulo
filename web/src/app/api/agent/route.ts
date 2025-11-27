import { agentRepo } from "@/db/repositories";
import { isMemberOf } from "@/lib/permissions";
import {
  authMiddleware,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server";
import { createBodySchema, getQuerySchema } from "./schema";
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

