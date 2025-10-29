import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ChatService } from "@/services/chat-service";
import { createLogger } from "@/lib/logs/console/logger";
import { z } from "zod";

const logger = createLogger("ChatsAPI");

// Schema for creating a new chat
const createChatSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  style: z.enum(["brainstorm", "debate", "analyze", "custom"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  instructions: z.string().max(2000).optional(),
  agentIds: z.array(z.string()).optional(),
  knowledgeBaseIds: z.array(z.string()).optional(),
});

// Schema for listing chats
const listChatsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * GET /api/v1/chats - List user's chats
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = listChatsSchema.parse({
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    });

    const chats = await ChatService.getUserChats(
      session.user.id,
      params.limit,
      params.offset
    );

    logger.info(`Retrieved ${chats.length} chats for user ${session.user.id}`);

    return NextResponse.json({
      data: chats,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore: chats.length === params.limit,
      },
    });
  } catch (error) {
    logger.error("Failed to list chats:", { error });
    return NextResponse.json(
      { error: "Failed to retrieve chats" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/chats - Create a new chat
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const params = createChatSchema.parse(body);

    const chat = await ChatService.createChat({
      userId: session.user.id,
      ...params,
    });

    logger.info(`Created chat ${chat.id} for user ${session.user.id}`);

    return NextResponse.json({ data: chat }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Failed to create chat:", { error });
    return NextResponse.json(
      { error: "Failed to create chat" },
      { status: 500 }
    );
  }
}