import {
  createErrorResponse,
  createSuccessResponse,
  extractBlobKey,
  extractFilename,
  extractS3Key,
  InvalidRequestError,
  isBlobPath,
  isCloudPath,
  isS3Path,
} from "@/routes/files/utils";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import { deleteFile } from "@/lib/uploads/core/storage-service";
import { requireAuth } from "@/middleware/auth";

const logger = createLogger("FilesDeleteAPI");

const router = createRouter();

router.post("/files/delete", requireAuth, async (c) => {
  try {
    const requestData = await c.req.json();
    const { filePath, context } = requestData;

    logger.info("File delete request received:", { filePath, context });

    if (!filePath) {
      throw new InvalidRequestError("No file path provided");
    }

    try {
      const key = extractStorageKey(filePath);

      const storageContext: StorageContext =
        context || inferContextFromKey(key);

      logger.info(`Deleting file with key: ${key}, context: ${storageContext}`);

      await deleteFile({
        key,
        context: storageContext,
      });

      logger.info(`File successfully deleted: ${key}`);

      return createSuccessResponse({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting file:", error);
      return createErrorResponse(
        error instanceof Error ? error : new Error("Failed to delete file"),
      );
    }
  } catch (error) {
    logger.error("Error parsing request:", error);
    return createErrorResponse(
      error instanceof Error ? error : new Error("Invalid request"),
    );
  }
});

function extractStorageKey(filePath: string): string {
  if (isS3Path(filePath)) {
    return extractS3Key(filePath);
  }

  if (isBlobPath(filePath)) {
    return extractBlobKey(filePath);
  }

  if (filePath.startsWith("/api/files/serve/")) {
    const pathWithoutQuery = filePath.split("?")[0];
    return decodeURIComponent(
      pathWithoutQuery.substring("/api/files/serve/".length),
    );
  }

  if (!isCloudPath(filePath)) {
    return extractFilename(filePath);
  }

  return filePath;
}

function inferContextFromKey(key: string): StorageContext {
  if (key.startsWith("kb/")) {
    return "knowledge-base";
  }

  if (key.match(/^\d+-[a-z0-9]+-/)) {
    return "general";
  }

  return "general";
}

export default router;
