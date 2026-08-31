import { getOpenRouterFallbackModels } from "@/lib/ai/openrouter-client";
import {
  listProviderModels,
  redactProviderError,
} from "@/lib/ai/provider-registry";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { aiProviderIdSchema } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const querySchema = z.object({
  providerId: aiProviderIdSchema.optional().default("openrouter"),
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
    if (query.providerId !== "openrouter") {
      try {
        const models = await listProviderModels({
          providerId: query.providerId,
          userId: c.var.user!.id,
          toolsOnly: query.toolsOnly,
        });
        return c.json({
          provider: query.providerId,
          models,
          cached: false,
          degraded: false,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        return c.json({
          provider: query.providerId,
          models: [],
          cached: false,
          degraded: true,
          warning: redactProviderError(error),
          fetchedAt: new Date().toISOString(),
        });
      }
    }
    try {
      const models = await listProviderModels({
        providerId: "openrouter",
        userId: c.var.user!.id,
        toolsOnly: query.toolsOnly,
      });
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
        warning: redactProviderError(error),
        fetchedAt: new Date().toISOString(),
      });
    }
  },
);

export default router;
