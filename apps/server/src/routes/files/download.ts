import { createRouter } from '@/lib/create-app';
import { createLogger } from '@/lib/logs/console/logger';
import { requireAuth } from '@/middleware/auth';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const logger = createLogger('FileDownloadAPI');
const router = createRouter();

const bodySchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  context: z.string().optional(),
});

router.post('/files/download', requireAuth, zValidator('json', bodySchema), async (c) => {
  try {
    const { key, name, context: contextInput } = c.req.valid('json');

    const context: AppStorageContext = contextInput && 
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    logger.info(`Generating download URL for ${context}: ${key}`);

    if (storageManager.supportsPresignedUrls(context)) {
      try {
        const downloadUrl = await storageManager.generatePresignedDownloadUrl({
          key,
          context,
          expirationSeconds: 5 * 60, // 5 minutes
        });

        return c.json({
          downloadUrl,
          expiresIn: 300,
          fileName: name || key.split('/').pop() || 'download',
        });
      } catch (error) {
        logger.error(`Failed to generate presigned URL: ${error}`);
        return c.json({ error: 'Failed to generate download URL' }, 500);
      }
    }

    // Local storage fallback
    const downloadUrl = `/api/files/serve/${encodeURIComponent(key)}`;
    return c.json({
      downloadUrl,
      expiresIn: null,
      fileName: name || key.split('/').pop() || 'download',
    });
  } catch (error) {
    logger.error('Download error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Download failed' },
      500
    );
  }
});

export default router;