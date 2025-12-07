import { createRouter } from '@/lib/create-app';
import { checkHybridAuth } from '@/lib/auth/hybrid';
import { createLogger } from '@/lib/logs/console/logger';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';

const logger = createLogger('FileServeAPI');
const router = createRouter();

const CONTENT_TYPE_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
}

router.get('/files/serve/*', async (c) => {
  try {
    const wildcard = c.req.param('*') || '';
    const key = decodeURIComponent(wildcard);

    if (!key) {
      return c.json({ error: 'No file key provided' }, 400);
    }

    // Check authentication
    const authResult = await checkHybridAuth(c.req.raw, { requireChatId: false });
    if (!authResult.success) {
      logger.warn(`Unauthorized file access: ${key}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const contextInput = c.req.query('context');
    const context: AppStorageContext = contextInput && 
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    logger.info(`Serving file from ${context}: ${key}`);

    const fileBuffer = await storageManager.download({ key, context });
    const filename = key.split('/').pop() || 'download';
    const contentType = getContentType(filename);

    logger.info(`File served: ${key} (${fileBuffer.length} bytes)`);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('File serve error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'File not found' },
      404
    );
  }
});

export default router;