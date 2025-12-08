import { suggestionRepo } from "@/db/repositories";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const querySchema = z.object({
  documentId: z.string().min(1, "Parameter documentId is required."),
});

const router = createRouter();

router.get(
  "/suggestions",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const { documentId } = c.req.valid("query");
    const user = c.var.user!;

    const suggestions = await suggestionRepo.findForDocument(documentId);

    const [suggestion] = suggestions;

    if (!suggestion) {
      return c.json([], 200);
    }

    if (suggestion.userId !== user.id) {
      throw new ForbiddenError();
    }

    return c.json(suggestions, 200);
  },
);

export default router;
