import { createErrorResponse } from "@/routes/files/utils";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import { USE_BLOB_STORAGE } from "@/lib/uploads/core/setup";
import {
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  hasCloudStorage,
} from "@/lib/uploads/core/storage-service";
import { validateFileType } from "@/lib/uploads/utils/validation";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { StatusCode } from "hono/utils/http-status";

const logger = createLogger("PresignedUploadAPI");

const bodySchema = z.object({
  fileName: z.string().min(1, "fileName is required"),
  contentType: z.string().min(1, "contentType is required"),
  fileSize: z.number().positive("fileSize must be a positive number"),
  userId: z.string().optional(),
  chatId: z.string().optional(),
});

class PresignedUrlError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: StatusCode = 400,
  ) {
    super(message);
    this.name = "PresignedUrlError";
  }
}

class ValidationError extends PresignedUrlError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

const router = createRouter();

router.post(
  "/files/presigned",
  requireAuth,
  zValidator("json", bodySchema),
  async (c) => {
    try {
      const session = await getSession(c.req.raw);
      if (!session?.user?.id) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const data = c.req.valid("json");
      const { fileName, contentType, fileSize } = data;

      const MAX_FILE_SIZE = 100 * 1024 * 1024;
      if (fileSize > MAX_FILE_SIZE) {
        throw new ValidationError(
          `File size (${fileSize} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`,
        );
      }

      const uploadTypeParam = c.req.query("type");
      const uploadType: StorageContext =
        uploadTypeParam === "knowledge-base"
          ? "knowledge-base"
          : uploadTypeParam === "chat"
            ? "chat"
            : uploadTypeParam === "profile-pictures"
              ? "profile-pictures"
              : "general";

      if (uploadType === "knowledge-base") {
        const fileValidationError = validateFileType(fileName, contentType);
        if (fileValidationError) {
          throw new ValidationError(`${fileValidationError.message}`);
        }
      }

      const sessionUserId = session.user.id;

      if (!hasCloudStorage()) {
        logger.info(
          `Local storage detected - presigned URL not available for ${fileName}, client will use API fallback`,
        );
        return c.json({
          fileName,
          presignedUrl: "",
          fileInfo: {
            path: "",
            key: "",
            name: fileName,
            size: fileSize,
            type: contentType,
          },
          directUploadSupported: false,
        });
      }

      logger.info(`Generating ${uploadType} presigned URL for ${fileName}`);

      const presignedUrlResponse = await generatePresignedUploadUrl({
        fileName,
        contentType,
        fileSize,
        context: uploadType,
        userId: sessionUserId,
        expirationSeconds: 3600,
      });

      let finalPath: string;

      try {
        const downloadUrl = await generatePresignedDownloadUrl(
          presignedUrlResponse.key,
          uploadType,
          24 * 60 * 60,
        );
        finalPath = downloadUrl;
        logger.info(`Generated presigned download URL for ${fileName}`);
      } catch (error) {
        logger.warn(
          `Failed to generate presigned download URL, using serve endpoint:`,
          error,
        );
        finalPath = `/api/files/serve/${USE_BLOB_STORAGE ? "blob" : "s3"}/${encodeURIComponent(presignedUrlResponse.key)}?context=${uploadType}`;
      }

      return c.json({
        fileName,
        presignedUrl: presignedUrlResponse.url,
        fileInfo: {
          path: finalPath,
          key: presignedUrlResponse.key,
          name: fileName,
          size: fileSize,
          type: contentType,
        },
        uploadHeaders: presignedUrlResponse.uploadHeaders,
        directUploadSupported: true,
      });
    } catch (error) {
      logger.error("Error generating presigned URL:", error);

      if (error instanceof PresignedUrlError) {
        c.status(error.statusCode);
        return c.json(
          {
            error: error.message,
            code: error.code,
            directUploadSupported: false,
          }
        );
      }

      return createErrorResponse(
        error instanceof Error
          ? error
          : new Error("Failed to generate presigned URL"),
      );
    }
  },
);

router.options("/files/presigned", (c) =>
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
