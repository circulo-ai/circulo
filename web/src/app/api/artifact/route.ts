import { artifactRepo } from "@/db/repositories";
import { getSession } from "@/lib/auth";
import { ChatSDKError } from "@/lib/errors";
import { isMemberOf } from "@/lib/permissions";
import {
  authMiddleware,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
} from "@/lib/server";
import { NextRequest } from "next/server";
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
      return new ChatSDKError("not_found:document").toResponse();
    }

    // Check if user owns the document
    if (document.userId === ctx.data.user.id) {
      return Response.json([document], { status: 200 });
    }

    // If user doesn't own it, check if they're in the same organization via chat
    if (!document.chatId) {
      return new ForbiddenError("You don't have access to this artifact!");
    }

    // Get chat to find organization
    const { chatRepo } = await import("@/db/repositories/chat-repo");
    const chat = await chatRepo.findById(document.chatId);

    if (!chat || !chat.organizationId) {
      return new ForbiddenError("No access!");
    }

    // Check if user is a member of the chat's organization
    const isOrgMember = await isMemberOf(ctx.data.user.id, chat.organizationId);

    if (!isOrgMember) {
      return new ForbiddenError("You don't have access to this artifact!");
    }

    return Response.json([document], { status: 200 });
  });

/**
 * POST /api/artifact?id=xxx
 * Create or update a document
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
      request,
      { query: { id }, body: { content, title, kind, chatId }, data: { user } },
    ) => {
      // Check if document exists
      const existingDoc = await artifactRepo.findById(id);

      if (existingDoc) {
        // Update existing document
        if (existingDoc.userId !== user.id) {
          // Check organization membership if not owner
          if (!existingDoc.chatId) {
            return new ChatSDKError("forbidden:document").toResponse();
          }

          const { chatRepo } = await import("@/db/repositories/chat-repo");
          const chat = await chatRepo.findById(existingDoc.chatId);

          if (!chat || !chat.organizationId) {
            return new ChatSDKError("forbidden:document").toResponse();
          }

          const isOrgMember = await isMemberOf(user.id, chat.organizationId);

          if (!isOrgMember) {
            return new ChatSDKError("forbidden:document").toResponse();
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
 * Delete a document
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is required.",
    ).toResponse();
  }

  const session = await getSession();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  const document = await artifactRepo.findById(id);

  if (!document) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  // Only document owner can delete
  if (document.userId !== session.user.id) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  const deletedDoc = await artifactRepo.delete(id);

  return Response.json(deletedDoc, { status: 200 });
}
