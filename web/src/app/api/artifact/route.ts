import { artifactRepo } from "@/db/repositories";
import { isMemberOf } from "@/lib/permissions";
import {
  authMiddleware,
  BadRequestError,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server";
import z from "zod";

const querySchema = z.object({
  id: z.uuid(),
});

/**
 * GET /api/artifact?id=xxx
 * Fetch an artifact by ID with permission checks
 */
export const GET = createSafeRoute()
  .use(authMiddleware())
  .query(querySchema)
  .handler(async (request, ctx) => {
    const id = ctx.query.id;

    if (!id) {
      throw new NotFoundError("Parameter id is missing");
    }

    // Fetch the document
    const document = await artifactRepo.findByIdWithSuggestions(id);

    if (!document) {
      throw new NotFoundError();
    }

    // Check if user owns the document
    if (document.userId === ctx.data.user.id) {
      return Response.json([document], { status: 200 });
    }

    // If user doesn't own it, check if they're in the same organization via chat
    if (!document.chatId) {
      throw new ForbiddenError("You don't have access to this artifact!");
    }

    // Get chat to find organization
    const { chatRepo } = await import("@/db/repositories/chat-repo");
    const chat = await chatRepo.findById(document.chatId);

    if (!chat || !chat.organizationId) {
      throw new ForbiddenError("No access!");
    }

    // Check if user is a member of the chat's organization
    const isOrgMember = await isMemberOf(ctx.data.user.id, chat.organizationId);

    if (!isOrgMember) {
      throw new ForbiddenError("You don't have access to this artifact!");
    }

    return Response.json([document], { status: 200 });
  });

/**
 * POST /api/artifact?id=xxx
 * Create or update a artifact
 */
export const POST = createSafeRoute()
  .use(authMiddleware())
  .query(querySchema)
  .body(
    z.object({
      title: z.string(),
      content: z.string(),
      chatId: z.uuid().optional(),
      kind: z.enum(["text", "image", "code", "sheet"]),
    }),
  )
  .handler(
    async (
      _,
      { query: { id }, body: { content, title, kind, chatId }, data: { user } },
    ) => {
      // Check if artifact exists
      const existingDoc = await artifactRepo.findById(id);

      if (existingDoc) {
        // Update existing artifact
        if (existingDoc.userId !== user.id) {
          // Check organization membership if not owner
          if (!existingDoc.chatId) {
            throw new ForbiddenError();
          }

          const { chatRepo } = await import("@/db/repositories/chat-repo");
          const chat = await chatRepo.findById(existingDoc.chatId);

          if (!chat || !chat.organizationId) {
            throw new ForbiddenError();
          }

          const isOrgMember = await isMemberOf(user.id, chat.organizationId);

          if (!isOrgMember) {
            throw new ForbiddenError();
          }
        }

        // Update the document
        const updatedDoc = await artifactRepo.update(id, {
          content,
          title,
          kind,
        });

        return Response.json(updatedDoc, { status: 200 });
      }

      // Create new document
      const newDoc = await artifactRepo.create({
        id,
        content,
        title,
        kind,
        userId: user.id,
        chatId: chatId ?? null,
        version: 1,
      });

      return Response.json(newDoc, { status: 200 });
    },
  );

/**
 * DELETE /api/artifact?id=xxx
 * Delete an artifact
 */
export const DELETE = createSafeRoute()
  .use(authMiddleware())
  .query(querySchema)
  .handler(async (request, { query: { id }, data: { user } }) => {
    if (!id) {
      throw new BadRequestError();
    }

    const document = await artifactRepo.findById(id);

    if (!document) {
      throw new NotFoundError();
    }

    // Only document owner can delete
    if (document.userId !== user.id) {
      throw new ForbiddenError();
    }

    const deletedDoc = await artifactRepo.delete(id);

    return Response.json(deletedDoc, { status: 200 });
  });
