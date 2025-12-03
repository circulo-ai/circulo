import { createErrorResponse } from "@/routes/files/utils";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import { USE_BLOB_STORAGE } from "@/lib/uploads/core/setup";
import {
  generateBatchPresignedUploadUrls,
  hasCloudStorage,
} from "@/lib/uploads/core/storage-service";
import { validateFileType } from "@/lib/uploads/utils/validation";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const logger = createLogger("BatchPresignedUploadAPI");

const fileSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().positive(),
});

const bodySchema = z.object({
  files: z.array(fileSchema).min(1).max(100),
});

const router = createRouter();

router.post(
  "/files/presigned/batch",
  requireAuth,
  zValidator("json", bodySchema),
  async (c) => {
    try {
      const session = await getSession(c.req.raw);
      if (!session?.user?.id) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { files } = c.req.valid("json");

      const uploadTypeParam = c.req.query("type");
      const uploadType: StorageContext =
        uploadTypeParam === "knowledge-base"
          ? "knowledge-base"
          : uploadTypeParam === "chat"
            ? "chat"
            : uploadTypeParam === "profile-pictures"
              ? "profile-pictures"
              : "general";

      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      for (const file of files) {
        if (file.fileSize > MAX_FILE_SIZE) {
          return c.json(
            {
              error: `File ${file.fileName} exceeds maximum size of ${MAX_FILE_SIZE} bytes`,
            },
            400,
          );
        }

        if (uploadType === "knowledge-base") {
          const fileValidationError = validateFileType(
            file.fileName,
            file.contentType,
          );
          if (fileValidationError) {
            return c.json(
              {
                error: fileValidationError.message,
                code: fileValidationError.code,
                supportedTypes: fileValidationError.supportedTypes,
              },
              400,
            );
          }
        }
      }

      const sessionUserId = session.user.id;

      if (!hasCloudStorage()) {
        logger.info(
          `Local storage detected - batch presigned URLs not available, client will use API fallback`,
        );
        return c.json({
          files: files.map((file) => ({
            fileName: file.fileName,
            presignedUrl: "",
            fileInfo: {
              path: "",
              key: "",
              name: file.fileName,
              size: file.fileSize,
              type: file.contentType,
            },
            directUploadSupported: false,
          })),
          directUploadSupported: false,
        });
      }

      logger.info(
        `Generating batch ${uploadType} presigned URLs for ${files.length} files`,
      );

      const startTime = Date.now();

      const presignedUrls = await generateBatchPresignedUploadUrls(
        files.map((file) => ({
          fileName: file.fileName,
          contentType: file.contentType,
          fileSize: file.fileSize,
        })),
        uploadType,
        sessionUserId,
        3600,
      );

      const duration = Date.now() - startTime;
      logger.info(
        `Generated ${files.length} presigned URLs in ${duration}ms (avg ${Math.round(duration / files.length)}ms per file)`,
      );

      const storagePrefix = USE_BLOB_STORAGE ? "blob" : "s3";

      return c.json({
        files: presignedUrls.map((urlResponse, index) => {
          const finalPath = `/api/files/serve/${storagePrefix}/${encodeURIComponent(urlResponse.key)}?context=${uploadType}`;

          return {
            fileName: files[index].fileName,
            presignedUrl: urlResponse.url,
            fileInfo: {
              path: finalPath,
              key: urlResponse.key,
              name: files[index].fileName,
              size: files[index].fileSize,
              type: files[index].contentType,
            },
            uploadHeaders: urlResponse.uploadHeaders,
            directUploadSupported: true,
          };
        }),
        directUploadSupported: true,
      });
    } catch (error) {
      logger.error("Error generating batch presigned URLs:", error);
      return createErrorResponse(
        error instanceof Error
          ? error
          : new Error("Failed to generate batch presigned URLs"),
      );
    }
  },
);

router.options("/files/presigned/batch", (c) =>
  c.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  ),
);

export default router;
