import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ChatService } from "@/services/chat-service";
import { createLogger } from "@/lib/logs/console/logger";

const logger = createLogger("ChatAPI");

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/v1/chats/[id] - Get chat by ID with all related data
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  let chatId: string | undefined;
  
  try {
    const session = await getSession();
    const resolvedParams = await params;
    chatId = resolvedParams.id;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    const chat = await ChatService.getChatById(chatId, session?.user?.id);

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    logger.info(`Retrieved chat ${chatId} for user ${session?.user?.id || 'anonymous'}`);

    return NextResponse.json({ data: chat });
  } catch (error) {
    if (error instanceof Error && error.message === "Access denied to private chat") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    logger.error(`Failed to get chat ${chatId || 'unknown'}:`, { error });
    return NextResponse.json(
      { error: "Failed to retrieve chat" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/chats/[id] - Delete a chat
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  let chatId: string | undefined;
  
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    chatId = resolvedParams.id;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    await ChatService.deleteChat(chatId, session.user.id);

    logger.info(`Deleted chat ${chatId} for user ${session.user.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Chat not found or access denied") {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 }
      );
    }

    logger.error(`Failed to delete chat ${chatId || 'unknown'}:`, { error });
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    );
  }
}