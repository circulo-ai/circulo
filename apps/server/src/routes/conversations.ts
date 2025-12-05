import { chatRepo } from "@/db/repositories";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  startingAfter: z.string().optional(),
  endingBefore: z.string().optional(),
  search: z.string().optional(),
});

const router = createRouter();

router.get(
  "/conversations",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const { limit, startingAfter, endingBefore, search } =
      c.req.valid("query");

    if (startingAfter && endingBefore) {
      return c.json({ error: "Bad request" }, 400);
    }

    const result = await chatRepo.getConversationSummariesByUserId({
      id: c.var.user!.id,
      limit,
      startingAfter,
      endingBefore,
    });

    return c.json(result);
  },
);

export default router;
