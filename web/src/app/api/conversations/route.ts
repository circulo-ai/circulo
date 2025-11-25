import { chatRepo } from "@/db/repositories";
import { authMiddleware, BadRequestError, createSafeRoute } from "@/lib/server";
import z from "zod";

const querySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(10),
  startingAfter: z.string().optional(),
  endingBefore: z.string().optional(),
  search: z.string().optional(),
});

export const GET = createSafeRoute()
  .query(querySchema)
  .use(authMiddleware())
  .handler(
    async (
      req,
      { query: { limit, startingAfter, endingBefore, search }, data: { user } },
    ) => {
      if (startingAfter && endingBefore) {
        throw new BadRequestError();
      }

      const result = await chatRepo.getConversationSummariesByUserId({
        id: user.id,
        limit,
        startingAfter,
        endingBefore,
      });

      return Response.json(result);
    },
  );
