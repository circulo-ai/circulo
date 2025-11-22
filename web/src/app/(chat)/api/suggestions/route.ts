import { getSuggestionsByDocumentId } from "@/db/queries";
import { createSafeRoute } from "@/lib/server";
import { ForbiddenError } from "@/lib/server/errors";
import { authMiddleware } from "@/lib/server/middlewares";
import { z } from "zod";

const querySchema = z.object({
  documentId: z.string().min(1, "Parameter documentId is required."),
});

export const GET = createSafeRoute()
  .methods("GET")
  .query(querySchema)
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const { documentId } = ctx.query;
    const { user } = ctx.data;

    const suggestions = await getSuggestionsByDocumentId({ documentId });

    const [suggestion] = suggestions;

    if (!suggestion) {
      return Response.json([], { status: 200 });
    }

    if (suggestion.userId !== user.id) {
      throw new ForbiddenError();
    }

    return Response.json(suggestions, { status: 200 });
  });
