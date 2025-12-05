import { createErrorResponse } from "@/routes/files/utils";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import {
  generatePresignedDownloadUrl,
  hasCloudStorage,
} from "@/lib/uploads/core/storage-service";
import { getBaseUrl } from "@/lib/urls/utils";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const logger = createLogger("FileDownload");

const bodySchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  context: z.string().optional(),
});

const router = createRouter();

router.post(
  "/files/download",
  requireAuth,
  zValidator("json", bodySchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const { key, name, context } = body;

      if (!key) {
        return createErrorResponse(new Error("File key is required"), 400);
      }

      logger.info(`Generating download URL for file: ${name || key}`);

      const storageContext: StorageContext = (context as StorageContext) || "general";

      if (hasCloudStorage()) {
        try {
          const downloadUrl = await generatePresignedDownloadUrl(
            key,
            storageContext,
            5 * 60,
          );

          logger.info(
            `Generated download URL for ${storageContext} file: ${key}`,
          );

          return c.json({
            downloadUrl,
            expiresIn: 300,
            fileName: name || key.split("/").pop() || "download",
          });
        } catch (error) {
          logger.error(`Failed to generate presigned URL for ${key}:`, error);
          return createErrorResponse(
            error instanceof Error
              ? error
              : new Error("Failed to generate download URL"),
            500,
          );
        }
      } else {
        const downloadUrl = `${getBaseUrl()}/api/files/serve/${encodeURIComponent(key)}?context=${storageContext}`;

        logger.info(`Using local storage path for file: ${key}`);

        return c.json({
          downloadUrl,
          expiresIn: null,
          fileName: name || key.split("/").pop() || "download",
        });
      }
    } catch (error) {
      logger.error("Error in file download endpoint:", error);
      return createErrorResponse(
        error instanceof Error ? error : new Error("Internal server error"),
        500,
      );
    }
  },
);

export default router;
