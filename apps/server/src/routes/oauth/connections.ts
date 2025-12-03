import { account, db, user } from "@/db";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import { eq } from "drizzle-orm";
import { jwtDecode } from "jwt-decode";

const logger = createLogger("OAuthConnectionsAPI");

interface GoogleIdToken {
  email?: string;
  sub?: string;
  name?: string;
}

const router = createRouter();

router.get("/auth/oauth/connections", requireAuth, async (c) => {
  const requestId = generateRequestId();

  try {
    const userId = c.var.user!.id;

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));

    const userRecord = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const userEmail = userRecord.length > 0 ? userRecord[0]?.email : null;

    const connections: any[] = [];

    for (const acc of accounts) {
      const [provider, featureType = "default"] = acc.providerId.split("-");

      if (provider) {
        let displayName = "";

        if (acc.idToken) {
          try {
            const decoded = jwtDecode<GoogleIdToken>(acc.idToken);
            if (decoded.email) {
              displayName = decoded.email;
            } else if (decoded.name) {
              displayName = decoded.name;
            }
          } catch (_error) {
            logger.warn(`[${requestId}] Error decoding ID token`, {
              accountId: acc.id,
            });
          }
        }

        if (!displayName && provider === "github") {
          displayName = `${acc.accountId} (GitHub)`;
        }

        if (!displayName && userEmail) {
          displayName = userEmail;
        }

        if (!displayName) {
          displayName = `${acc.accountId} (${provider})`;
        }

        const connectionKey = acc.providerId;

        const existingConnection = connections.find(
          (conn) => conn.provider === connectionKey,
        );

        if (existingConnection) {
          existingConnection.accounts = existingConnection.accounts || [];
          existingConnection.accounts.push({
            id: acc.id,
            name: displayName,
          });
        } else {
          connections.push({
            provider: connectionKey,
            baseProvider: provider,
            featureType,
            isConnected: true,
            scopes: acc.scope ? acc.scope.split(" ") : [],
            lastConnected: acc.updatedAt.toISOString(),
            accounts: [
              {
                id: acc.id,
                name: displayName,
              },
            ],
          });
        }
      }
    }

    return c.json({ connections }, 200);
  } catch (error) {
    logger.error(`[${requestId}] Error fetching OAuth connections`, error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default router;
