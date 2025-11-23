import { getStreamContext } from "@/app/api/chat/route";
import { chatRepo, messageRepo, streamRepo } from "@/db/repositories";
import type { Chat } from "@/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { createSafeRoute } from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import type { ChatMessage } from "@/lib/types";
import { createUIMessageStream, JsonToSseTransformStream } from "ai";
import { differenceInSeconds } from "date-fns";
import { z } from "zod";

class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
  toResponse() {
    return Response.json({ message: this.message }, { status: 404 });
  }
}

const paramsSchema = z.object({ id: z.uuid() });

export const GET = createSafeRoute()
  .methods("GET")
  .params(paramsSchema)
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const { id: chatId } = ctx.params;
    const { user } = ctx.data;

    const streamContext = getStreamContext();
    const resumeRequestedAt = new Date();

    if (!streamContext) {
      return new Response(null, { status: 204 });
    }

    let chat: Chat | undefined;
    try {
      chat = await chatRepo.findById(chatId);
    } catch {
      throw new ChatSDKError("not_found:chat");
    }

    if (!chat) {
      throw new ChatSDKError("not_found:chat");
    }

    if (chat.visibility === "private" && chat.creatorId !== user.id) {
      throw new ChatSDKError("forbidden:chat");
    }

    const streamIds = await streamRepo.getStreamIdsByChatId({ chatId });

    if (!streamIds.length) {
      throw new NotFoundError();
    }

    const recentStreamId = streamIds.at(-1);
    if (!recentStreamId) {
      throw new NotFoundError();
    }

    const emptyDataStream = createUIMessageStream<ChatMessage>({
      execute: () => {},
    });

    const stream = await streamContext.resumableStream(recentStreamId, () =>
      emptyDataStream.pipeThrough(new JsonToSseTransformStream()),
    );

    // For when generation is streaming during SSR but resumable stream has concluded
    if (!stream) {
      const messages = await messageRepo.findForChat(chatId);
      const mostRecentMessage = messages.at(-1);

      if (!mostRecentMessage) {
        return new Response(emptyDataStream, { status: 200 });
      }

      if (mostRecentMessage.role !== "assistant") {
        return new Response(emptyDataStream, { status: 200 });
      }

      const messageCreatedAt = new Date(mostRecentMessage.createdAt);

      if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
        return new Response(emptyDataStream, { status: 200 });
      }

      const restoredStream = createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({
            type: "data-appendMessage",
            data: JSON.stringify(mostRecentMessage),
            transient: true,
          });
        },
      });

      return new Response(
        restoredStream.pipeThrough(new JsonToSseTransformStream()),
        { status: 200 },
      );
    }

    return new Response(stream, { status: 200 });
  });
