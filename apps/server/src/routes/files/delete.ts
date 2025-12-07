import { createRouter } from '@/lib/create-app';
import { createLogger } from '@/lib/logs/console/logger';
import { requireAuth } from '@/middleware/auth';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';

const logger = createLogger('FileDeleteAPI');
const router = createRouter();

router.post('/files/delete', requireAuth, async (c) => {
  try {
    const { key, context: contextInput } = await c.req.json();

    if (!key) {
      return c.json({ error: 'File key is required' }, 400);
    }

    const context: AppStorageContext = contextInput && 
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    logger.info(`Deleting file from ${context}: ${key}`);

    await storageManager.delete({ key, context });

    logger.info(`Successfully deleted: ${key}`);
    return c.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Delete error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      500
    );
  }
});

export default router;