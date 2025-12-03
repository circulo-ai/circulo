import { getCredential, refreshTokenIfNeeded } from "@/routes/oauth/utils";
import { authorizeCredentialUse } from "@/lib/auth/credential-access";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

const logger = createLogger("OAuthTokenAPI");

const router = createRouter();

router.post("/auth/oauth/token", async (c) => {
  const requestId = generateRequestId();

  logger.info(`[${requestId}] OAuth token API POST request received`);

  try {
    const body = await c.req.json();
    const { credentialId, chatId } = body;

    if (!credentialId) {
      logger.warn(`[${requestId}] Credential ID is required`);
      return c.json({ error: "Credential ID is required" }, 400);
    }

    const authz = await authorizeCredentialUse(c.req.raw, {
      credentialId,
      chatId,
      requireChatIdForInternal: false,
    });
    if (!authz.ok || !authz.credentialOwnerUserId) {
      return c.json(
        { error: authz.error || "Unauthorized" },
        403,
      );
    }

    const credential = await getCredential(
      requestId,
      credentialId,
      authz.credentialOwnerUserId,
    );

    try {
      const { accessToken } = await refreshTokenIfNeeded(
        requestId,
        credential,
        credentialId,
      );
      return c.json({ accessToken }, 200);
    } catch (error) {
      logger.error(`[${requestId}] Failed to refresh access token:`, error);
      return c.json(
        { error: "Failed to refresh access token" },
        401,
      );
    }
  } catch (error) {
    logger.error(`[${requestId}] Error getting access token`, error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

router.get("/auth/oauth/token", async (c) => {
  const requestId = generateRequestId();

  try {
    const { searchParams } = new URL(c.req.url);
    const credentialId = searchParams.get("credentialId");

    if (!credentialId) {
      logger.warn(`[${requestId}] Missing credential ID`);
      return c.json({ error: "Credential ID is required" }, 400);
    }

    const auth = await checkHybridAuth(c.req.raw, { requireChatId: false });
    if (!auth.success || auth.authType !== "session" || !auth.userId) {
      return c.json({ error: "User not authenticated" }, 401);
    }

    const credential = await getCredential(
      requestId,
      credentialId,
      auth.userId,
    );

    if (!credential) {
      return c.json({ error: "Credential not found" }, 404);
    }

    if (!credential.accessToken) {
      logger.warn(`[${requestId}] No access token available for credential`);
      return c.json({ error: "No access token available" }, 400);
    }

    try {
      const { accessToken } = await refreshTokenIfNeeded(
        requestId,
        credential,
        credentialId,
      );
      return c.json({ accessToken }, 200);
    } catch (_error) {
      return c.json({ error: "Failed to refresh access token" }, 401);
    }
  } catch (error) {
    logger.error(`[${requestId}] Error fetching access token`, error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default router;
