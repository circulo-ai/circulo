import { createErrorResponse, InvalidRequestError } from "@/routes/files/utils";
import { getSession } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import {
  generatePresignedDownloadUrl,
  hasCloudStorage,
  uploadFile,
} from "@/lib/uploads/core/storage-service";
import { requireAuth } from "@/middleware/auth";

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "csv",
  "xlsx",
  "xls",
  "json",
  "yaml",
  "yml",
]);

function validateFileExtension(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension) return false;
  return ALLOWED_EXTENSIONS.has(extension);
}

const logger = createLogger("FilesUploadAPI");
const router = createRouter();

router.post("/files/upload", requireAuth, async (c) => {
  try {
    const session = await getSession(c.req.raw);
    if (!session?.user?.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const formData = await c.req.raw.formData();
    const files = formData.getAll("file") as File[];
    const contextInput = formData.get("context");
    const context =
      typeof contextInput === "string" &&
      ["general", "knowledge-base", "organization", "chat", "profile-pictures"].includes(
        contextInput,
      )
        ? (contextInput as
            | "general"
            | "knowledge-base"
            | "organization"
            | "chat"
            | "profile-pictures")
        : "general";

    if (!files || files.length === 0) {
      throw new InvalidRequestError("No files provided");
    }

    const usingCloudStorage = hasCloudStorage();
    logger.info(
      `Using storage mode: ${usingCloudStorage ? "Cloud" : "Local"} for file upload`,
    );

    const uploadResults = [];

    for (const file of files) {
      const originalName = file.name;

      if (!validateFileExtension(originalName)) {
        const extension =
          originalName.split(".").pop()?.toLowerCase() || "unknown";
        throw new InvalidRequestError(
          `File type '${extension}' is not allowed. Allowed types: ${Array.from(
            ALLOWED_EXTENSIONS,
          ).join(", ")}`,
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      try {
        logger.info(`Uploading file (${context} context): ${originalName}`);

        const fileInfo = await uploadFile({
          file: buffer,
          fileName: originalName,
          contentType: file.type,
          context,
        });

        let downloadUrl: string | undefined;
        if (hasCloudStorage()) {
          try {
            downloadUrl = await generatePresignedDownloadUrl(
              fileInfo.key,
              context,
              24 * 60 * 60,
            );
          } catch (error) {
            logger.warn(
              `Failed to generate presigned URL for ${originalName}:`,
              error,
            );
          }
        }

        const uploadResult = {
          name: originalName,
          size: buffer.length,
          type: file.type,
          key: fileInfo.key,
          path: fileInfo.path,
          url: downloadUrl || fileInfo.path,
          uploadedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          context,
        };

        logger.info(`Successfully uploaded: ${fileInfo.key}`);
        uploadResults.push(uploadResult);
      } catch (error) {
        logger.error(`Error uploading ${originalName}:`, error);
        throw error;
      }
    }

    if (uploadResults.length === 1) {
      return c.json(uploadResults[0]);
    }
    return c.json({ files: uploadResults });
  } catch (error) {
    logger.error("Error in file upload:", error);
    return createErrorResponse(
      error instanceof Error ? error : new Error("File upload failed"),
    );
  }
});

router.options("/files/upload", () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  }),
);

export default router;
