import {
  createErrorResponse,
  createFileResponse,
  FileNotFoundError,
  findLocalFile,
  getContentType,
} from "@/routes/files/utils";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { createLogger } from "@/lib/logs/console/logger";
import { isUsingCloudStorage } from "@/lib/uploads";
import type { StorageContext } from "@/lib/uploads/core/config-resolver";
import { downloadFile } from "@/lib/uploads/core/storage-service";
import { readFile } from "fs/promises";
import { createRouter } from "@/lib/create-app";

const logger = createLogger("FilesServeAPI");

const router = createRouter();

router.get("/files/serve/*", async (c) => {
  try {
    const wildcard = c.req.param("*") || "";
    const pathSegments = wildcard.split("/").filter(Boolean);

    if (!pathSegments || pathSegments.length === 0) {
      throw new FileNotFoundError("No file path provided");
    }

    logger.info("File serve request:", { path: pathSegments });

    const authResult = await checkHybridAuth(c.req.raw, {
      requireChatId: false,
    });

    if (!authResult.success) {
      logger.warn("Unauthorized file access attempt", {
        path: pathSegments,
        error: authResult.error,
      });
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = authResult.userId;
    const fullPath = pathSegments.join("/");
    const isS3Path = pathSegments[0] === "s3";
    const isBlobPath = pathSegments[0] === "blob";
    const isCloudPath = isS3Path || isBlobPath;
    const cloudKey = isCloudPath ? pathSegments.slice(1).join("/") : fullPath;

    const contextParam = c.req.query("context");
    const legacyBucketType = c.req.query("bucket");

    if (isUsingCloudStorage() || isCloudPath) {
      return await handleCloudProxy(
        cloudKey,
        contextParam,
        legacyBucketType,
        userId,
      );
    }

    return await handleLocalFile(fullPath, userId);
  } catch (error) {
    logger.error("Error serving file:", error);

    if (error instanceof FileNotFoundError) {
      return createErrorResponse(error);
    }

    return createErrorResponse(
      error instanceof Error ? error : new Error("Failed to serve file"),
    );
  }
});

async function handleLocalFile(
  filename: string,
  userId?: string,
): Promise<Response> {
  try {
    const filePath = findLocalFile(filename);

    if (!filePath) {
      throw new FileNotFoundError(`File not found: ${filename}`);
    }

    const fileBuffer = await readFile(filePath);
    const contentType = getContentType(filename);

    logger.info("Local file served", {
      userId,
      filename,
      size: fileBuffer.length,
    });

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename,
    });
  } catch (error) {
    logger.error("Error reading local file:", error);
    throw error;
  }
}

/**
 * Infer storage context from file key pattern
 */
function inferContextFromKey(key: string): StorageContext {
  // KB files always start with 'kb/' prefix
  if (key.startsWith("kb/")) {
    return "knowledge-base";
  }

  // Organization files: UUID-like ID followed by timestamp pattern
  // Pattern: {uuid}/{timestamp}-{random}-{filename}
  if (key.match(/^[a-f0-9-]{36}\/\d+-[a-z0-9]+-/)) {
    return "organization";
  }

  return "general";
}

async function handleCloudProxy(
  cloudKey: string,
  contextParam?: string | null,
  legacyBucketType?: string | null,
  userId?: string,
): Promise<Response> {
  try {
    let context: StorageContext;

    if (contextParam) {
      context = contextParam as StorageContext;
      logger.info(`Using explicit context: ${context} for key: ${cloudKey}`);
    } else {
      context = inferContextFromKey(cloudKey);
      logger.info(`Inferred context: ${context} from key pattern: ${cloudKey}`);
    }

    let fileBuffer: Buffer;

    fileBuffer = await downloadFile({
      key: cloudKey,
      context,
    });

    const originalFilename = cloudKey.split("/").pop() || "download";
    const contentType = getContentType(originalFilename);

    logger.info("Cloud file served", {
      userId,
      key: cloudKey,
      size: fileBuffer.length,
      context,
    });

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename: originalFilename,
    });
  } catch (error) {
    logger.error("Error downloading from cloud storage:", error);
    throw error;
  }
}

export default router;
