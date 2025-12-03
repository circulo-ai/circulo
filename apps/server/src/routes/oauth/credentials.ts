import { db } from "@/db";
import { account, user } from "@/db/schema";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import type { OAuthService } from "@/lib/oauth/oauth";
import { parseProvider } from "@/lib/oauth/oauth";
import { generateRequestId } from "@/lib/server-utils";
import { and, eq } from "drizzle-orm";
import { jwtDecode } from "jwt-decode";

export const dynamic = "force-dynamic";

const logger = createLogger("OAuthCredentialsAPI");

interface GoogleIdToken {
  email?: string;
  sub?: string;
  name?: string;
}

const router = createRouter();

router.get("/auth/oauth/credentials", async (c) => {
  const requestId = generateRequestId();

  try {
    const { searchParams } = new URL(c.req.url);
    const providerParam = searchParams.get("provider") as OAuthService | null;
    const chatId = searchParams.get("chatId");
    const credentialId = searchParams.get("credentialId");

    const authResult = await checkHybridAuth(c.req.raw, { requireChatId: false });
    if (!authResult.success || !authResult.userId) {
      logger.warn(
        `[${requestId}] Unauthenticated credentials request rejected`,
      );
      return c.json({ error: "User not authenticated" }, 401);
    }
    const requesterUserId = authResult.userId;

    let effectiveUserId: string = requesterUserId;

    if (!providerParam && !credentialId) {
      logger.warn(`[${requestId}] Missing provider parameter`);
      return c.json(
        { error: "Provider or credentialId is required" },
        400,
      );
    }

    const { baseProvider } = parseProvider(providerParam || "google-default");

    let accountsData;

    if (credentialId) {
      accountsData = await db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, effectiveUserId),
            eq(account.id, credentialId),
          ),
        );
    } else {
      accountsData = await db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, effectiveUserId),
            eq(account.providerId, providerParam!),
          ),
        );
    }

    const credentials = await Promise.all(
      accountsData.map(async (acc) => {
        const [_, featureType = "default"] = acc.providerId.split("-");

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

        if (!displayName && baseProvider === "github") {
          displayName = `${acc.accountId} (GitHub)`;
        }

        if (!displayName) {
          try {
            const userRecord = await db
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, acc.userId))
              .limit(1);

            if (userRecord.length > 0) {
              displayName = userRecord[0].email;
            }
          } catch (_error) {
            logger.warn(`[${requestId}] Error fetching user email`, {
              userId: acc.userId,
            });
          }
        }

        if (!displayName) {
          displayName = `${acc.accountId} (${baseProvider})`;
        }

        return {
          id: acc.id,
          name: displayName,
          provider: acc.providerId,
          lastUsed: acc.updatedAt.toISOString(),
          isDefault: featureType === "default",
        };
      }),
    );

    return c.json({ credentials }, 200);
  } catch (error) {
    logger.error(`[${requestId}] Error fetching OAuth credentials`, error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default router;
