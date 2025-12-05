import { db } from "@/db";
import { account } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import { and, eq, like, or } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const dynamic = "force-dynamic";

const logger = createLogger("OAuthDisconnectAPI");

const bodySchema = z.object({
  provider: z.string().min(1),
  providerId: z.string().optional(),
});

const router = createRouter();

router.post(
  "/auth/oauth/disconnect",
  requireAuth,
  zValidator("json", bodySchema),
  async (c) => {
    const requestId = generateRequestId();

    try {
      const session = await getSession(c.req.raw);

      if (!session?.user?.id) {
        logger.warn(`[${requestId}] Unauthenticated disconnect request rejected`);
        return c.json({ error: "User not authenticated" }, 401);
      }

      const { provider, providerId } = c.req.valid("json");

      logger.info(`[${requestId}] Processing OAuth disconnect request`, {
        provider,
        hasProviderId: !!providerId,
      });

      if (providerId) {
        await db
          .delete(account)
          .where(
            and(
              eq(account.userId, session.user.id),
              eq(account.providerId, providerId),
            ),
          );
      } else {
        await db
          .delete(account)
          .where(
            and(
              eq(account.userId, session.user.id),
              or(
                eq(account.providerId, provider),
                like(account.providerId, `${provider}-%`),
              ),
            ),
          );
      }

      return c.json({ success: true }, 200);
    } catch (error) {
      logger.error(`[${requestId}] Error disconnecting OAuth provider`, error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

export default router;
