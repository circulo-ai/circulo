import { createRouter } from '@/lib/create-app';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/logs/console/logger';
import { requireAuth } from '@/middleware/auth';
import { validateFileType, validateFileSize, MAX_FILE_SIZE } from '@circulo-ai/upload';
import { storageManager, type AppStorageContext } from '@/lib/storage/config';

const logger = createLogger('FileUploadAPI');
const router = createRouter();

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg',
  'gif', 'csv', 'xlsx', 'xls', 'json', 'yaml', 'yml',
]);

function validateFileExtension(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? ALLOWED_EXTENSIONS.has(extension) : false;
}

router.post('/files/upload', requireAuth, async (c) => {
  try {
    const session = await getSession(c.req.raw);
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.raw.formData();
    const files = formData.getAll('file') as File[];
    const contextInput = formData.get('context');

    const context: AppStorageContext =
      typeof contextInput === 'string' &&
      storageManager.hasContext(contextInput as AppStorageContext)
        ? (contextInput as AppStorageContext)
        : 'general';

    if (!files || files.length === 0) {
      return c.json({ error: 'No files provided' }, 400);
    }

    const uploadResults = [];

    for (const file of files) {
      // Validate extension
      if (!validateFileExtension(file.name)) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'unknown';
        return c.json(
          {
            error: `File type '${extension}' is not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
          },
          400
        );
      }

      // Validate size
      const sizeError = validateFileSize(file.size, MAX_FILE_SIZE);
      if (sizeError) {
        return c.json({ error: sizeError.message }, 400);
      }

      // Validate file type for knowledge-base
      if (context === 'knowledge-base') {
        const typeError = validateFileType(file.name, file.type);
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

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      try {
        logger.info(`Uploading file to ${context}: ${file.name}`);

        const fileInfo = await storageManager.upload({
          file: buffer,
          fileName: file.name,
          contentType: file.type,
          context,
          metadata: {
            userId: session.user.id,
            uploadSource: 'web',
          },
        });

        // Generate download URL if supported
        let downloadUrl: string | undefined;
        if (storageManager.supportsPresignedUrls(context)) {
          try {
            downloadUrl = await storageManager.generatePresignedDownloadUrl({
              key: fileInfo.key,
              context,
              expirationSeconds: 24 * 60 * 60,
            });
          } catch (error) {
            logger.warn(`Failed to generate presigned URL: ${error}`);
          }
        }

        uploadResults.push({
          id: fileInfo.key,
          name: file.name,
          size: buffer.length,
          type: file.type,
          key: fileInfo.key,
          path: fileInfo.path,
          url: downloadUrl || fileInfo.path,
          uploadedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          context,
        });

        logger.info(`Successfully uploaded: ${fileInfo.key}`);
      } catch (error) {
        logger.error(`Error uploading ${file.name}:`, error);
        throw error;
      }
    }

    return c.json(uploadResults.length === 1 ? uploadResults[0] : { files: uploadResults });
  } catch (error) {
    logger.error('File upload error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      500
    );
  }
});

export default router;