import { createRouter } from '@/lib/create-app';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/logs/console/logger';
import { requireAuth } from '@/middleware/auth';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';

const logger = createLogger('MultipartUploadAPI');
const router = createRouter();

router.post('/files/multipart', requireAuth, async (c) => {
  try {
    const session = await getSession(c.req.raw);
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const action = c.req.query('action');
    const data = await c.req.json();
    const contextInput = data.context;

    const context: AppStorageContext = contextInput && 
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    // Check if provider supports multipart
    if (!storageManager.supportsMultipartUpload(context)) {
      return c.json(
        { error: `Provider for ${context} doesn't support multipart upload` },
        400
      );
    }

    switch (action) {
      case 'initiate': {
        const { fileName, contentType, fileSize, metadata } = data;

        const result = await storageManager.initiateMultipartUpload({
          fileName,
          contentType,
          fileSize,
          context,
          metadata: {
            userId: session.user.id,
            ...metadata,
          },
        });

        logger.info(`Initiated multipart upload for ${context}: ${result.uploadId}`);
        return c.json(result);
      }

      case 'get-part-urls': {
        const { uploadId, key, partNumbers } = data;

        const urls = await storageManager.getMultipartPartUrls({
          uploadId,
          key,
          partNumbers,
          context,
        });

        return c.json({ presignedUrls: urls });
      }

      case 'complete': {
        const { uploadId, key, parts } = data;

        const result = await storageManager.completeMultipartUpload({
          uploadId,
          key,
          parts,
          context,
        });

        logger.info(`Completed multipart upload for ${context}: ${key}`);
        return c.json(result);
      }

      case 'abort': {
        const { uploadId, key } = data;

        await storageManager.abortMultipartUpload({
          uploadId,
          key,
          context,
        });

        logger.info(`Aborted multipart upload for ${context}: ${key}`);
        return c.json({ success: true });
      }

      default:
        return c.json(
          { error: 'Invalid action. Use: initiate, get-part-urls, complete, or abort' },
          400
        );
    }
  } catch (error) {
    logger.error('Multipart upload error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Multipart operation failed' },
      500
    );
  }
});

export default router;