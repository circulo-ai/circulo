import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ChatService } from "@/services/chat-service";
import { createLogger } from "@/lib/logs/console/logger";
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk";

const logger = createLogger("MessagesAPI");

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// Schema for sending a message
const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  files: z.array(z.object({
    type: z.literal("file"),
    url: z.string(),
    mediaType: z.string(),
    filename: z.string(),
  })).optional(),
  quotedMessageId: z.string().optional(),
});

/**
 * POST /api/v1/chats/[id]/messages - Send a message and trigger processing
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const body = await request.json();
    const messageData = sendMessageSchema.parse(body);

    // Check if user has access to the chat
    const chat = await ChatService.getChatById(chatId, session.user.id);
    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 }
      );
    }

    // Check if user has sufficient balance (rough estimate)
    const estimatedCost = 0.01; // $0.01 minimum estimate
    const hasBalance = await ChatService.checkUserBalance(
      session.user.id,
      estimatedCost
    );

    if (!hasBalance) {
      return NextResponse.json(
        { error: "Insufficient balance. Please add funds to your wallet." },
        { status: 402 }
      );
    }

    // Send the user message
    const message = await ChatService.sendMessage({
      chatId,
      userId: session.user.id,
      content: messageData.content,
      files: messageData.files,
      quotedMessageId: messageData.quotedMessageId,
    });

    // Trigger chat processing task
    try {
      const handle = await tasks.trigger("process-chat", {
        chatId,
        messageId: message.id,
        userId: session.user.id,
      });

      logger.info(
        `Triggered chat processing task ${handle.id} for chat ${chatId}`
      );

      return NextResponse.json({
        data: {
          message,
          taskId: handle.id,
        },
      });
    } catch (triggerError) {
      logger.error("Failed to trigger chat processing:", { triggerError });
      
      // Return the message even if task triggering fails
      return NextResponse.json({
        data: {
          message,
          taskId: null,
          warning: "Message sent but processing may be delayed",
        },
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    logger.error(`Failed to send message to chat ${chatId || 'unknown'}:`, { error });
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/chats/[id]/messages - Get messages for a chat
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

    // Get chat with messages (this also checks access permissions)
    const chat = await ChatService.getChatById(chatId, session?.user?.id);

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    logger.info(`Retrieved ${chat.messages.length} messages for chat ${chatId}`);

    return NextResponse.json({
      data: chat.messages,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Access denied to private chat") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    logger.error(`Failed to get messages for chat ${chatId || 'unknown'}:`, { error });
    return NextResponse.json(
      { error: "Failed to retrieve messages" },
      { status: 500 }
    );
  }
}