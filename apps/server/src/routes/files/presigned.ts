
import { createRouter } from '@/lib/create-app';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/logs/console/logger';
import { requireAuth } from '@/middleware/auth';
import { validateFileType, validateFileSize, MAX_FILE_SIZE } from '@circulo-ai/upload';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const logger = createLogger('PresignedUrlAPI');
const router = createRouter();

const bodySchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().positive(),
});

router.post('/files/presigned', requireAuth, zValidator('json', bodySchema), async (c) => {
  try {
    const session = await getSession(c.req.raw);
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { fileName, contentType, fileSize } = c.req.valid('json');
    const contextInput = c.req.query('type') || c.req.query('context');

    const context: AppStorageContext = contextInput && 
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    // Validate file size
    const sizeError = validateFileSize(fileSize, MAX_FILE_SIZE);
    if (sizeError) {
      return c.json({ error: sizeError.message }, 400);
    }

    // Validate file type for knowledge-base
    if (context === 'knowledge-base') {
      const typeError = validateFileType(fileName, contentType);
      if (typeError) {
        return c.json(
          {
            error: typeError.message,
            code: typeError.code,
            supportedTypes: typeError.supportedTypes,
          },
          400
        );
      }
    }

    // Check if provider supports presigned URLs
    if (!storageManager.supportsPresignedUrls(context)) {
      logger.info(`Provider for ${context} doesn't support presigned URLs`);
      return c.json({
        fileName,
        presignedUrl: '',
        fileInfo: {
          path: '',
          key: '',
          name: fileName,
          size: fileSize,
          type: contentType,
        },
        directUploadSupported: false,
      });
    }

    logger.info(`Generating presigned upload URL for ${context}: ${fileName}`);

    const result = await storageManager.generatePresignedUploadUrl({
      fileName,
      contentType,
      fileSize,
      context,
      expirationSeconds: 3600,
      metadata: {
        userId: session.user.id,
      },
    });

    // Try to generate download URL
    let downloadUrl: string | undefined;
    try {
      downloadUrl = await storageManager.generatePresignedDownloadUrl({
        key: result.key,
        context,
        expirationSeconds: 24 * 60 * 60,
      });
    } catch (error) {
      logger.warn(`Failed to generate download URL: ${error}`);
    }

    return c.json({
      fileName,
      presignedUrl: result.url,
      fileInfo: {
        path: downloadUrl || `/api/files/serve/${encodeURIComponent(result.key)}`,
        key: result.key,
        name: fileName,
        size: fileSize,
        type: contentType,
      },
      uploadHeaders: result.uploadHeaders,
      directUploadSupported: true,
    });
  } catch (error) {
    logger.error('Presigned URL error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to generate URL' },
      500
    );
  }
});

export default router;