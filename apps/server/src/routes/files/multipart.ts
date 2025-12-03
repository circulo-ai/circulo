import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import {
  getStorageConfig,
  getStorageProvider,
  isUsingCloudStorage,
  type StorageContext,
} from "@/lib/uploads";
import { requireAuth } from "@/middleware/auth";

const logger = createLogger("MultipartUploadAPI");

interface InitiateMultipartRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  context?: StorageContext;
}

interface GetPartUrlsRequest {
  uploadId: string;
  key: string;
  partNumbers: number[];
  context?: StorageContext;
}

const router = createRouter();

router.post("/files/multipart", requireAuth, async (c) => {
  try {
    const session = await getSession(c.req.raw);
    if (!session?.user?.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const action = c.req.query("action");

    if (!isUsingCloudStorage()) {
      return c.json(
        {
          error:
            "Multipart upload is only available with cloud storage (S3 or Azure Blob)",
        },
        400,
      );
    }

    const storageProvider = getStorageProvider();

    switch (action) {
      case "initiate": {
        const data = (await c.req.json()) as InitiateMultipartRequest;
        const {
          fileName,
          contentType,
          fileSize,
          context = "knowledge-base",
        } = data;

        const config = getStorageConfig(context);

        if (storageProvider === "s3") {
          const { initiateS3MultipartUpload } = await import(
            "@/lib/uploads/providers/s3/s3-client"
          );

          const result = await initiateS3MultipartUpload({
            fileName,
            contentType,
            fileSize,
          });

          logger.info(
            `Initiated S3 multipart upload for ${fileName} (context: ${context}): ${result.uploadId}`,
          );

          return c.json({
            uploadId: result.uploadId,
            key: result.key,
          });
        }
        if (storageProvider === "blob") {
          const { initiateMultipartUpload } = await import(
            "@/lib/uploads/providers/blob/blob-client"
          );

          const result = await initiateMultipartUpload({
            fileName,
            contentType,
            fileSize,
            customConfig: {
              containerName: config.containerName!,
              accountName: config.accountName!,
              accountKey: config.accountKey,
              connectionString: config.connectionString,
            },
          });

          logger.info(
            `Initiated Azure multipart upload for ${fileName} (context: ${context}): ${result.uploadId}`,
          );

          return c.json({
            uploadId: result.uploadId,
            key: result.key,
          });
        }

        return c.json(
          { error: `Unsupported storage provider: ${storageProvider}` },
          400,
        );
      }

      case "get-part-urls": {
        const data = (await c.req.json()) as GetPartUrlsRequest;
        const { uploadId, key, partNumbers, context = "knowledge-base" } = data;

        const config = getStorageConfig(context);

        if (storageProvider === "s3") {
          const { getS3MultipartPartUrls } = await import(
            "@/lib/uploads/providers/s3/s3-client"
          );

          const presignedUrls = await getS3MultipartPartUrls(
            key,
            uploadId,
            partNumbers,
          );

          return c.json({ presignedUrls });
        }
        if (storageProvider === "blob") {
          const { getMultipartPartUrls } = await import(
            "@/lib/uploads/providers/blob/blob-client"
          );

          const presignedUrls = await getMultipartPartUrls(
            key,
            uploadId,
            partNumbers,
            {
              containerName: config.containerName!,
              accountName: config.accountName!,
              accountKey: config.accountKey,
              connectionString: config.connectionString,
            },
          );

          return c.json({ presignedUrls });
        }

        return c.json(
          { error: `Unsupported storage provider: ${storageProvider}` },
          400,
        );
      }

      case "complete": {
        const data = await c.req.json();
        const context: StorageContext = (data.context as StorageContext) || "knowledge-base";

        const config = getStorageConfig(context);

        if ("uploads" in data) {
          const results = await Promise.all(
            (data.uploads as any[]).map(async (upload: any) => {
              const { uploadId, key } = upload;

              if (storageProvider === "s3") {
                const { completeS3MultipartUpload } = await import(
                  "@/lib/uploads/providers/s3/s3-client"
                );
                const parts = upload.parts;

                const result = await completeS3MultipartUpload(
                  key,
                  uploadId,
                  parts,
                );

                return {
                  success: true,
                  location: result.location,
                  path: result.path,
                  key: result.key,
                };
              }
              if (storageProvider === "blob") {
                const { completeMultipartUpload } = await import(
                  "@/lib/uploads/providers/blob/blob-client"
                );
                const parts = upload.parts;

                const result = await completeMultipartUpload(
                  key,
                  uploadId,
                  parts,
                  {
                    containerName: config.containerName!,
                    accountName: config.accountName!,
                    accountKey: config.accountKey,
                    connectionString: config.connectionString,
                  },
                );

                return {
                  success: true,
                  location: result.location,
                  path: result.path,
                  key: result.key,
                };
              }

              throw new Error(
                `Unsupported storage provider: ${storageProvider}`,
              );
            }),
          );

          logger.info(
            `Completed ${data.uploads.length} multipart uploads (context: ${context})`,
          );
          return c.json({ results });
        }

        const { uploadId, key, parts } = data as any;

        if (storageProvider === "s3") {
          const { completeS3MultipartUpload } = await import(
            "@/lib/uploads/providers/s3/s3-client"
          );

          const result = await completeS3MultipartUpload(key, uploadId, parts);

          logger.info(
            `Completed S3 multipart upload for key ${key} (context: ${context})`,
          );

          return c.json({
            success: true,
            location: result.location,
            path: result.path,
            key: result.key,
          });
        }
        if (storageProvider === "blob") {
          const { completeMultipartUpload } = await import(
            "@/lib/uploads/providers/blob/blob-client"
          );

          const result = await completeMultipartUpload(key, uploadId, parts, {
            containerName: config.containerName!,
            accountName: config.accountName!,
            accountKey: config.accountKey,
            connectionString: config.connectionString,
          });

          logger.info(
            `Completed Azure multipart upload for key ${key} (context: ${context})`,
          );

          return c.json({
            success: true,
            location: result.location,
            path: result.path,
            key: result.key,
          });
        }

        return c.json(
          { error: `Unsupported storage provider: ${storageProvider}` },
          400,
        );
      }

      case "abort": {
        const data = await c.req.json();
        const { uploadId, key, context = "knowledge-base" } = data as any;

        const config = getStorageConfig(context as StorageContext);

        if (storageProvider === "s3") {
          const { abortS3MultipartUpload } = await import(
            "@/lib/uploads/providers/s3/s3-client"
          );

          await abortS3MultipartUpload(key, uploadId);

          logger.info(
            `Aborted S3 multipart upload for key ${key} (context: ${context})`,
          );
        } else if (storageProvider === "blob") {
          const { abortMultipartUpload } = await import(
            "@/lib/uploads/providers/blob/blob-client"
          );

          await abortMultipartUpload(key, uploadId, {
            containerName: config.containerName!,
            accountName: config.accountName!,
            accountKey: config.accountKey,
            connectionString: config.connectionString,
          });

          logger.info(
            `Aborted Azure multipart upload for key ${key} (context: ${context})`,
          );
        } else {
          return c.json(
            { error: `Unsupported storage provider: ${storageProvider}` },
            400,
          );
        }

        return c.json({ success: true });
      }

      default:
        return c.json(
          {
            error:
              "Invalid action. Use: initiate, get-part-urls, complete, or abort",
          },
          400,
        );
    }
  } catch (error) {
    logger.error("Multipart upload error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Multipart upload failed",
      },
      500,
    );
  }
});

export default router;
