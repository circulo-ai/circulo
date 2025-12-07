import { createHonoFileRoutes } from '@circulo-ai/upload/hono';
import { storageManager } from '@/lib/storage/config';
import { requireAuth } from '@/middleware/auth';
import { getSession } from '@/lib/auth';
import { checkHybridAuth } from '@/lib/auth/hybrid';
import type { AppEnv } from '@/lib/create-app';

const fileRoutes = createHonoFileRoutes<AppEnv>(
  {
    storageManager,
    maxFileSize: 100 * 1024 * 1024,
    serveUrlBuilder: (key: string, context: string): string => {
      // This matches your previous behavior where you had a storage prefix in the URL.
      // If you later switch to blob for some contexts, you can make this conditional.
      const storagePrefix = 's3';

      return `/api/files/serve/${storagePrefix}/${encodeURIComponent(
        key,
      )}?context=${encodeURIComponent(context)}`;
    },
  },
  {
    getUploadMetadata: async (c) => {
      const session = await getSession(c.req.raw);

      const metadata: Record<string, string> = {};

      const userId = session?.user?.id;
      if (typeof userId === 'string' && userId.length > 0) {
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
      upload: { middleware: [requireAuth] },
      serve: {
        middleware: [
          async (c, next) => {
            const authResult = await checkHybridAuth(c.req.raw, {
              requireChatId: false,
            });

            if (!authResult.success) {
              return c.json({ error: 'Unauthorized' } as const, 401);
            }

            await next();
          },
        ],
      },
    },
  },
);

export default fileRoutes;
