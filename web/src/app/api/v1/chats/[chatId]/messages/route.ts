import { chat, db, message } from "@/db";
import { inngest } from "@/inngest/client";
import { getSession } from "@/lib/auth";
import { emitStreamEvent } from "@/lib/sse";
import { asc, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;

  // Require authenticated user
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Verify user has access to this chat (owner check)
  const chatRow = await db.query.chat.findFirst({ where: eq(chat.id, chatId) });
  if (!chatRow || chatRow.userId !== session.user.id) {
    return Response.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const messages = await db.query.message.findMany({
    where: eq(message.chatId, chatId),
    orderBy: [asc(message.createdAt)],
  });
  return Response.json({ success: true, data: messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;
  const session = await getSession();
  const { content } = await request.json();

  if (!session?.user?.id) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Verify user has access to this chat (owner check)
  const chatRow = await db.query.chat.findFirst({ where: eq(chat.id, chatId) });
  if (!chatRow || chatRow.userId !== session.user.id) {
    return Response.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Trigger Inngest workflow
  await inngest.send({
    name: "chat/roundtable.start",
    data: {
      chatId,
      userId: session?.user.id,
      userMessage: content,
    },
  });

  return Response.json({ success: true });
}
