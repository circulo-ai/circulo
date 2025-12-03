import { refreshAccessTokenIfNeeded } from "@/routes/oauth/utils";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/utils";
import { requireAuth } from "@/middleware/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const logger = createLogger("MicrosoftFilesAPI");

const router = createRouter();

router.get("/auth/oauth/microsoft/files", requireAuth, async (c) => {
  const requestId = generateRequestId();

  try {
    const session = await getSession(c.req.raw);

    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated request rejected`);
      return c.json({ error: "User not authenticated" }, 401);
    }

    const { searchParams } = new URL(c.req.url);
    const credentialId = searchParams.get("credentialId");
    const query = searchParams.get("query") || "";

    if (!credentialId) {
      logger.warn(`[${requestId}] Missing credential ID`);
      return c.json({ error: "Credential ID is required" }, 400);
    }

    const credentials = await db
      .select()
      .from(account)
      .where(eq(account.id, credentialId))
      .limit(1);

    if (!credentials.length) {
      logger.warn(`[${requestId}] Credential not found`, { credentialId });
      return c.json({ error: "Credential not found" }, 404);
    }

    const credential = credentials[0];

    if (credential.userId !== session.user.id) {
      logger.warn(`[${requestId}] Unauthorized credential access attempt`, {
        credentialUserId: credential.userId,
        requestUserId: session.user.id,
      });
      return c.json({ error: "Unauthorized" }, 403);
    }

    const accessToken = await refreshAccessTokenIfNeeded(
      credentialId,
      session.user.id,
      requestId,
    );

    if (!accessToken) {
      return c.json(
        { error: "Failed to obtain valid access token" },
        401,
      );
    }

    let searchQuery = ".xlsx";
    if (query) {
      searchQuery = `${query} .xlsx`;
    }

    const searchParams_new = new URLSearchParams();
    searchParams_new.append(
      "$select",
      "id,name,mimeType,webUrl,thumbnails,createdDateTime,lastModifiedDateTime,size,createdBy",
    );
    searchParams_new.append("$top", "50");

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')?${searchParams_new.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: { message: "Unknown error" } }));
      logger.error(`[${requestId}] Microsoft Graph API error`, {
        status: response.status,
        error:
          errorData.error?.message ||
          "Failed to fetch Excel files from Microsoft OneDrive",
      });
      return c.json(
        {
          error:
            errorData.error?.message ||
            "Failed to fetch Excel files from Microsoft OneDrive",
        },
        response.status,
      );
    }

    const data = await response.json();
    let files = data.value || [];

    files = files
      .filter(
        (file: any) =>
          file.name?.toLowerCase().endsWith(".xlsx") ||
          file.mimeType ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType:
          file.mimeType ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        iconLink: file.thumbnails?.[0]?.small?.url,
        webViewLink: file.webUrl,
        thumbnailLink: file.thumbnails?.[0]?.medium?.url,
        createdTime: file.createdDateTime,
        modifiedTime: file.lastModifiedDateTime,
        size: file.size?.toString(),
        owners: file.createdBy
          ? [
              {
                displayName: file.createdBy.user?.displayName || "Unknown",
                emailAddress: file.createdBy.user?.email || "",
              },
            ]
          : [],
      }));

    return c.json({ files }, 200);
  } catch (error) {
    logger.error(
      `[${requestId}] Error fetching Excel files from Microsoft OneDrive`,
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default router;
