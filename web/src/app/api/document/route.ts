import type { ArtifactKind } from "@/components/artifacts/artifact";
import { documentRepo } from "@/db/repositories";
import { getSession } from "@/lib/auth";
import { ChatSDKError } from "@/lib/errors";
import { isMemberOf } from "@/lib/permissions";
import { NextRequest } from "next/server";

/**
 * GET /api/document?id=xxx
 * Fetch a document by ID with permission checks
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is missing",
    ).toResponse();
  }

  const session = await getSession();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  // Fetch the document
  const document = await documentRepo.findByIdWithSuggestions(id);

  if (!document) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  // Check if user owns the document
  if (document.userId === session.user.id) {
    return Response.json([document], { status: 200 });
  }

  // If user doesn't own it, check if they're in the same organization via chat
  if (!document.chatId) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  // Get chat to find organization
  const { chatRepo } = await import("@/db/repositories/chat-repo");
  const chat = await chatRepo.findById(document.chatId);

  if (!chat || !chat.organizationId) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  // Check if user is a member of the chat's organization
  const isOrgMember = await isMemberOf(session.user.id, chat.organizationId);

  if (!isOrgMember) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  return Response.json([document], { status: 200 });
}

/**
 * POST /api/document?id=xxx
 * Create or update a document
 */
export async function POST(request: NextRequest) {
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

  const {
    content,
    title,
    kind,
    chatId,
  }: {
    content: string;
    title: string;
    kind: ArtifactKind;
    chatId?: string;
  } = await request.json();

  // Check if document exists
  const existingDoc = await documentRepo.findById(id);

  if (existingDoc) {
    // Update existing document
    if (existingDoc.userId !== session.user.id) {
      // Check organization membership if not owner
      if (!existingDoc.chatId) {
        return new ChatSDKError("forbidden:document").toResponse();
      }

      const { chatRepo } = await import("@/db/repositories/chat-repo");
      const chat = await chatRepo.findById(existingDoc.chatId);

      if (!chat || !chat.organizationId) {
        return new ChatSDKError("forbidden:document").toResponse();
      }

      const isOrgMember = await isMemberOf(
        session.user.id,
        chat.organizationId,
      );

      if (!isOrgMember) {
        return new ChatSDKError("forbidden:document").toResponse();
      }
    }

    // Update the document
    const updatedDoc = await documentRepo.update(id, {
      content,
      title,
      kind,
    });

    return Response.json(updatedDoc, { status: 200 });
  }

  // Create new document
  const newDoc = await documentRepo.create({
    id,
    content,
    title,
    kind,
    userId: session.user.id,
    chatId: chatId ?? null,
    version: 1,
  });

  return Response.json(newDoc, { status: 200 });
}

/**
 * DELETE /api/document?id=xxx
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

  const document = await documentRepo.findById(id);

  if (!document) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  // Only document owner can delete
  if (document.userId !== session.user.id) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  const deletedDoc = await documentRepo.delete(id);

  return Response.json(deletedDoc, { status: 200 });
}
