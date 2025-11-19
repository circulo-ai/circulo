import { getConversationSummariesByUserId } from "@/db/queries";
import { getSession } from "@/lib/auth";
import { ChatSDKError } from "@/lib/errors";
import { api } from "@/lib/server";
import z from "zod";

export const GET = api(
  {
    query: z.object({
      limit: z.number().min(1).max(100).optional(),
      starting_after: z.string().optional(),
      ending_before: z.string().optional(),
      search: z.string().optional(),
    }),
  },
  async (req, ctx) => {
    const limit = ctx.query.limit ?? 10;
    const startingAfter = ctx.query.starting_after;
    const endingBefore = ctx.query.ending_before;

    if (startingAfter && endingBefore) {
      return new ChatSDKError(
        "bad_request:api",
        "Only one of starting_after or ending_before can be provided.",
      ).toResponse();
    }

    const session = await getSession();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const result = await getConversationSummariesByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });

    return Response.json(result);
  },
);
