import {
  getOpenRouterFallbackModels,
  listOpenRouterModels,
} from "@/lib/ai/openrouter-client";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const querySchema = z.object({
  refresh: z.coerce.boolean().optional().default(false),
  toolsOnly: z.coerce.boolean().optional().default(false),
});

const router = createRouter();

router.get(
  "/models",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const query = c.req.valid("query");
    try {
      const models = await listOpenRouterModels(query);
      return c.json({
        provider: "openrouter",
        models,
        cached: !query.refresh,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Keep the catalog usable when OpenRouter is temporarily unavailable;
      // chat execution still reports the actionable configuration error.
      return c.json({
        provider: "openrouter",
        models: getOpenRouterFallbackModels(),
        cached: false,
        degraded: true,
        warning:
          error instanceof Error ? error.message : "OpenRouter unavailable",
        fetchedAt: new Date().toISOString(),
      });
    }
  },
);

export default router;
