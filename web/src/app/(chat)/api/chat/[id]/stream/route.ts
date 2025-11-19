import {
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
} from "@/db/queries";
import type { Chat } from "@/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { api, Errors, noContent } from "@/lib/server";
import type { ChatMessage } from "@/lib/types";
import { createUIMessageStream, JsonToSseTransformStream } from "ai";
import { differenceInSeconds } from "date-fns";
import z from "zod";
import { getStreamContext } from "../../route";

export const GET = api(
  {
    auth: true,
    params: z.object({
      id: z.uuid(),
    }),
  },
  async (_, { user, params: { id: chatId } }) => {
    const streamContext = getStreamContext();
    const resumeRequestedAt = new Date();

    if (!streamContext) {
      return noContent();
    }

    if (!chatId) {
      throw Errors.badRequest();
    }

    let chat: Chat | null;

    try {
      chat = await getChatById({ id: chatId });
    } catch {
      return new ChatSDKError("not_found:chat").toResponse();
    }

    if (!chat) {
      return new ChatSDKError("not_found:chat").toResponse();
    }

    if (chat.visibility === "private" && chat.creatorId !== user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    const streamIds = await getStreamIdsByChatId({ chatId });

    if (!streamIds.length) {
      throw Errors.notFound();
    }

    const recentStreamId = streamIds.at(-1);

    if (!recentStreamId) {
      throw Errors.notFound();
    }

    const emptyDataStream = createUIMessageStream<ChatMessage>({
      // biome-ignore lint/suspicious/noEmptyBlockStatements: "Needs to exist"
      execute: () => {},
    });

    const stream = await streamContext.resumableStream(recentStreamId, () =>
      emptyDataStream.pipeThrough(new JsonToSseTransformStream()),
    );

    /*
     * For when the generation is streaming during SSR
     * but the resumable stream has concluded at this point.
     */
    if (!stream) {
      const messages = await getMessagesByChatId({ id: chatId });
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
  },
);
