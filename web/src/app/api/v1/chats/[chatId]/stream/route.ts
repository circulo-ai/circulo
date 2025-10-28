import { subscribeToStream } from "@/lib/sse";
import { db, chat } from "@/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params;

  // Require authenticated user
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify user has access to this chat (owner check)
  const chatRow = await db.query.chat.findFirst({
    where: eq(chat.id, chatId),
  });
  if (!chatRow || chatRow.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeToStream(chatId, (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      });

      request.signal.addEventListener("abort", async () => {
        try {
          (await unsubscribe)();
        } finally {
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
