import { env } from "@/lib/env";
import { createLogger } from "@/lib/logs/console/logger";
import {
  getStorageProvider,
  USE_BLOB_STORAGE,
  USE_S3_STORAGE,
} from "@/lib/uploads/core/setup";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import path, { join } from "path";

const logger = createLogger("UploadsSetup");

// Server-only upload directory path
const PROJECT_ROOT = path.resolve(process.cwd());
export const UPLOAD_DIR_SERVER = join(PROJECT_ROOT, "uploads");

/**
 * Server-only function to ensure uploads directory exists
 */
export async function ensureUploadsDirectory() {
  if (USE_S3_STORAGE) {
    logger.info("Using S3-compatible storage, skipping local uploads directory creation");
    return true;
  }

  if (USE_BLOB_STORAGE) {
    logger.info(
      "Using Azure Blob storage, skipping local uploads directory creation",
    );
    return true;
  }

  try {
    if (!existsSync(UPLOAD_DIR_SERVER)) {
      await mkdir(UPLOAD_DIR_SERVER, { recursive: true });
    } else {
      logger.info(`Uploads directory already exists at ${UPLOAD_DIR_SERVER}`);
    }
    return true;
  } catch (error) {
    logger.error("Failed to create uploads directory:", error);
    return false;
  }
}

// Immediately invoke on server startup
if (typeof process !== "undefined") {
  const storageProvider = getStorageProvider();

  // Log storage mode
  logger.info(`Storage provider: ${storageProvider}`);

  if (USE_BLOB_STORAGE) {
    // Verify Azure Blob credentials
    if (!env.AZURE_STORAGE_CONTAINER_NAME) {
      logger.warn(
        "Azure Blob storage is enabled but AZURE_STORAGE_CONTAINER_NAME is not set",
      );
    } else if (!env.AZURE_ACCOUNT_NAME && !env.AZURE_CONNECTION_STRING) {
      logger.warn(
        "Azure Blob storage is enabled but neither AZURE_ACCOUNT_NAME nor AZURE_CONNECTION_STRING is set",
      );
      logger.warn(
        "Set AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY or AZURE_CONNECTION_STRING for Azure Blob storage",
      );
    } else if (
      env.AZURE_ACCOUNT_NAME &&
      !env.AZURE_ACCOUNT_KEY &&
      !env.AZURE_CONNECTION_STRING
    ) {
      logger.warn(
        "AZURE_ACCOUNT_NAME is set but AZURE_ACCOUNT_KEY is missing and no AZURE_CONNECTION_STRING provided",
      );
      logger.warn(
        "Set AZURE_ACCOUNT_KEY or use AZURE_CONNECTION_STRING for authentication",
      );
    } else {
      logger.info(
        "Azure Blob storage credentials found in environment variables",
      );
      if (env.AZURE_CONNECTION_STRING) {
        logger.info("Using Azure connection string for authentication");
      } else {
        logger.info("Using Azure account name and key for authentication");
      }
    }
  } else if (USE_S3_STORAGE) {
    // Verify S3-compatible credentials
    if (!env.S3_BUCKET_NAME) {
      logger.warn("S3 storage configuration is missing a bucket name");
    } else {
      logger.info("S3-compatible credentials configured");
      if (env.S3_ENDPOINT) {
        logger.info(`Using custom endpoint: ${env.S3_ENDPOINT}`);
      }
      if (!env.S3_REGION) {
        logger.warn("S3_REGION is not set; defaulting to us-east-1");
      }
      if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        logger.warn("S3 access/secret keys are not set");
      }
    }
  } else {
    // Local storage mode
    logger.info("Using local file storage");

    // Only initialize local uploads directory when using local storage
    ensureUploadsDirectory().then((success) => {
      if (success) {
        logger.info("Local uploads directory initialized");
      } else {
        logger.error("Failed to initialize local uploads directory");
      }
    });
  }

  // Log additional configuration details
  if (USE_BLOB_STORAGE && env.AZURE_STORAGE_KB_CONTAINER_NAME) {
    logger.info(
      `Azure Blob knowledge base container: ${env.AZURE_STORAGE_KB_CONTAINER_NAME}`,
    );
  }
  if (USE_BLOB_STORAGE && env.AZURE_STORAGE_COPILOT_CONTAINER_NAME) {
    logger.info(
      `Azure Blob copilot container: ${env.AZURE_STORAGE_COPILOT_CONTAINER_NAME}`,
    );
  }
  if (USE_S3_STORAGE && env.S3_KB_BUCKET_NAME) {
    logger.info(`S3 knowledge base bucket: ${env.S3_KB_BUCKET_NAME}`);
  }
  if (USE_S3_STORAGE && env.S3_COPILOT_BUCKET_NAME) {
    logger.info(`S3 copilot bucket: ${env.S3_COPILOT_BUCKET_NAME}`);
  }
}

export default ensureUploadsDirectory;
