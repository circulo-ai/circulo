import { refreshAccessTokenIfNeeded } from "@/routes/oauth/utils";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { requireAuth } from "@/middleware/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const logger = createLogger("MicrosoftFileAPI");

const router = createRouter();

router.get("/auth/oauth/microsoft/file", requireAuth, async (c) => {
  const requestId = generateRequestId();
  try {
    const session = await getSession(c.req.raw);

    if (!session?.user?.id) {
      return c.json({ error: "User not authenticated" }, 401);
    }

    const { searchParams } = new URL(c.req.url);
    const credentialId = searchParams.get("credentialId");
    const fileId = searchParams.get("fileId");

    if (!credentialId || !fileId) {
      return c.json(
        { error: "Credential ID and File ID are required" },
        400,
      );
    }

    const credentials = await db
      .select()
      .from(account)
      .where(eq(account.id, credentialId))
      .limit(1);

    if (!credentials.length) {
      return c.json({ error: "Credential not found" }, 404);
    }

    const credential = credentials[0];

    if (credential.userId !== session.user.id) {
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

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?$select=id,name,mimeType,webUrl,thumbnails,createdDateTime,lastModifiedDateTime,size,createdBy`,
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
          "Failed to fetch file from Microsoft OneDrive",
      });
      return new Response(
        JSON.stringify({
          error:
            errorData.error?.message ||
            "Failed to fetch file from Microsoft OneDrive",
        }),
        {
          status: response.status,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    const file = await response.json();

    const transformedFile = {
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
      downloadUrl: `https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/content`,
    };

    return c.json({ file: transformedFile }, 200);
  } catch (error) {
    logger.error(
      `[${requestId}] Error fetching file from Microsoft OneDrive`,
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default router;
