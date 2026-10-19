import { getSession } from "@/lib/auth";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import type { AppEnv } from "@/lib/create-app";
import { createRouter } from "@/lib/create-app";
import { createLogger } from "@/lib/logs/console/logger";
import { storageManager } from "@/lib/storage/config";
import {
  createFileAccessToken,
  verifyFileAccessToken,
} from "@/lib/storage/file-access-token";
import { requireAuth } from "@/middleware/auth";
import { createHonoFileRoutes } from "@circulo-ai/upload/hono";
import { validateFileType } from "@circulo-ai/upload/validation";
import { bodyLimit } from "hono/body-limit";

const uploadLogger = createLogger("FileUpload");

const fileRoutes = createHonoFileRoutes<AppEnv>(
  {
    storageManager,
    maxFileSize: 100 * 1024 * 1024,
    validateFile: ({ fileName, contentType }) =>
      validateFileType(fileName, contentType),
    serveUrlBuilder: (key: string, context: string) => {
      return `/api/files/serve/${encodeURIComponent(
        key,
      )}?context=${encodeURIComponent(context)}&token=${encodeURIComponent(
        createFileAccessToken(key, context),
      )}`;
    },
    hooks: {
      onError: (error, context) => {
        uploadLogger.error("File upload route error", {
          context,
          error,
          errorName: error.name,
          platform: process.platform,
        });
      },
    },
  },
  {
    getUploadMetadata: async (c) => {
      const session = await getSession(c.req.raw);

      const metadata: Record<string, string> = {};
      const userId = session?.user?.id;

      if (typeof userId === "string" && userId.length > 0) {
        metadata.userId = userId;
      }

      return metadata;
    },
    routes: {
      delete: { middleware: [requireAuth] },
      download: { middleware: [requireAuth] },
      presigned: { middleware: [requireAuth] },
      presignedBatch: { middleware: [requireAuth] },
      multipart: { middleware: [requireAuth] },
      upload: {
        middleware: [
          requireAuth,
          bodyLimit({
            maxSize: 101 * 1024 * 1024,
            onError: (c) =>
              c.json(
                { error: "Upload request exceeds the 100 MiB limit" },
                413,
              ),
          }),
        ],
      },
      serve: {
        middleware: [
          async (c, next) => {
            const path = c.req.path;
            const idx = path.indexOf("/serve/");
            const rawKey = idx >= 0 ? path.slice(idx + "/serve/".length) : "";
            let key = "";
            try {
              key = decodeURIComponent(rawKey);
            } catch {
              return c.json({ error: "Invalid file key" } as const, 400);
            }
            const context = c.req.query("context") ?? "general";
            const token = c.req.query("token");
            // Live NODE_ENV read: `@/lib/env` snapshots at import, and a
            // production security gate should reflect the running environment.
            if (
              process.env.NODE_ENV === "production" &&
              !verifyFileAccessToken(key, context, token)
            ) {
              return c.json(
                { error: "Invalid file access token" } as const,
                401,
              );
            }

            const authResult = await checkHybridAuth(c.req.raw, {
              requireChatId: false,
            });
            if (!authResult.success) {
              return c.json({ error: "Unauthorized" } as const, 401);
            }
            await next();
          },
        ],
      },
    },
  },
);

const router = createRouter();

router.route("/files", fileRoutes);

export default router;
