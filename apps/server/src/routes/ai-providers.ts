import { aiProviderCredential, db } from "@/db";
import {
  listProviderModels,
  publicProviderDefinitions,
  redactProviderError,
} from "@/lib/ai/provider-registry";
import { createRouter } from "@/lib/create-app";
import { encryptSecret } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import {
  BadRequestError,
  aiProviderCredentialCreateSchema,
  aiProviderCredentialIdSchema,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const modelQuerySchema = z.object({
  providerId: aiProviderCredentialCreateSchema.shape.providerId,
  toolsOnly: z.coerce.boolean().optional().default(false),
});

const router = createRouter();

router.get("/ai-providers", requireAuth, async (c) => {
  const credentials = await db.query.aiProviderCredential.findMany({
    where: eq(aiProviderCredential.userId, c.var.user!.id),
    columns: {
      id: true,
      providerId: true,
      name: true,
      baseUrl: true,
      enabled: true,
      lastValidatedAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json({
    providers: publicProviderDefinitions(),
    credentials,
  });
});

router.post(
  "/ai-providers",
  requireAuth,
  zValidator("json", aiProviderCredentialCreateSchema),
  async (c) => {
    const body = c.req.valid("json");
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    const definition = publicProviderDefinitions().find(
      (provider) => provider.id === body.providerId,
    );
    if (definition?.requiresBaseUrl && !baseUrl) {
      throw new BadRequestError(`${definition.name} requires an API base URL.`);
    }

    try {
      await listProviderModels({
        providerId: body.providerId,
        toolsOnly: false,
        apiKey: body.apiKey,
        ...(baseUrl ? { baseUrl } : {}),
      });
    } catch (error) {
      throw new BadRequestError(redactProviderError(error));
    }

    const { encrypted } = await encryptSecret(body.apiKey);
    try {
      const [credential] = await db
        .insert(aiProviderCredential)
        .values({
          userId: c.var.user!.id,
          providerId: body.providerId,
          name: body.name,
          encryptedApiKey: encrypted,
          baseUrl,
          enabled: true,
          lastValidatedAt: new Date(),
          lastError: null,
        })
        .onConflictDoUpdate({
          target: [
            aiProviderCredential.userId,
            aiProviderCredential.providerId,
          ],
          set: {
            name: body.name,
            encryptedApiKey: encrypted,
            baseUrl,
            enabled: true,
            lastValidatedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: aiProviderCredential.id,
          providerId: aiProviderCredential.providerId,
          name: aiProviderCredential.name,
          baseUrl: aiProviderCredential.baseUrl,
          enabled: aiProviderCredential.enabled,
          lastValidatedAt: aiProviderCredential.lastValidatedAt,
        });
      return c.json(credential, 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestError("Unable to replace this provider key.");
      }
      throw error;
    }
  },
);

router.get(
  "/ai-providers/models",
  requireAuth,
  zValidator("query", modelQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    try {
      const models = await listProviderModels({
        providerId: query.providerId,
        userId: c.var.user!.id,
        toolsOnly: query.toolsOnly,
      });
      return c.json({ providerId: query.providerId, models, degraded: false });
    } catch (error) {
      return c.json({
        providerId: query.providerId,
        models: [],
        degraded: true,
        warning: redactProviderError(error),
      });
    }
  },
);

router.delete(
  "/ai-providers/:id",
  requireAuth,
  zValidator("param", aiProviderCredentialIdSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await db
      .delete(aiProviderCredential)
      .where(
        and(
          eq(aiProviderCredential.id, id),
          eq(aiProviderCredential.userId, c.var.user!.id),
        ),
      )
      .returning({ id: aiProviderCredential.id });
    if (!deleted[0]) throw new BadRequestError("Provider credential not found");
    return c.json({ success: true });
  },
);

function normalizeBaseUrl(value?: string) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestError("Enter a valid provider API base URL.");
  }
  if (url.username || url.password) {
    throw new BadRequestError(
      "Provider API URLs must not include embedded credentials.",
    );
  }
  if (envProduction() && url.protocol !== "https:") {
    throw new BadRequestError(
      "Custom provider endpoints must use HTTPS in production.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function envProduction() {
  return process.env.NODE_ENV === "production";
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export default router;
