import type { NextRequest } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import type { StorageContext } from '@/lib/uploads/core/config-resolver'
import { deleteFile } from '@/lib/uploads/core/storage-service'
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  extractBlobKey,
  extractFilename,
  extractS3Key,
  InvalidRequestError,
  isBlobPath,
  isCloudPath,
  isS3Path,
} from '@/app/api/files/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('FilesDeleteAPI')

/**
 * Main API route handler for file deletion
 */
export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json()
    const { filePath, context } = requestData

    logger.info('File delete request received:', { filePath, context })

    if (!filePath) {
      throw new InvalidRequestError('No file path provided')
    }

    try {
      const key = extractStorageKey(filePath)

      const storageContext: StorageContext = context || inferContextFromKey(key)

      logger.info(`Deleting file with key: ${key}, context: ${storageContext}`)

      await deleteFile({
        key,
        context: storageContext,
      })

      logger.info(`File successfully deleted: ${key}`)

      return createSuccessResponse({
        success: true,
        message: 'File deleted successfully',
      })
    } catch (error) {
      logger.error('Error deleting file:', error)
      return createErrorResponse(
        error instanceof Error ? error : new Error('Failed to delete file')
      )
    }
  } catch (error) {
    logger.error('Error parsing request:', error)
    return createErrorResponse(error instanceof Error ? error : new Error('Invalid request'))
  }
}

/**
 * Extract storage key from file path (works for S3, Blob, and local paths)
 */
function extractStorageKey(filePath: string): string {
  if (isS3Path(filePath)) {
    return extractS3Key(filePath)
  }

  if (isBlobPath(filePath)) {
    return extractBlobKey(filePath)
  }

  // Handle "/api/files/serve/<key>" paths
  if (filePath.startsWith('/api/files/serve/')) {
    const pathWithoutQuery = filePath.split('?')[0]
    return decodeURIComponent(pathWithoutQuery.substring('/api/files/serve/'.length))
  }

  // For local files, extract filename
  if (!isCloudPath(filePath)) {
    return extractFilename(filePath)
  }

  // As a last resort, assume the incoming string is already a raw key
  return filePath
}

/**
 * Infer storage context from file key structure
 *
 * Key patterns:
 * - KB: kb/{uuid}-{filename}
 * - Chat: Uses execution context (same pattern as execution files)
 * - General: {timestamp}-{random}-{filename} (fallback for ambiguous patterns)
 */
function inferContextFromKey(key: string): StorageContext {
  // KB files always start with 'kb/' prefix
  if (key.startsWith('kb/')) {
    return 'knowledge-base'
  }

  // Copilot/General files: timestamp-random-filename (no path segments)
  // Pattern: {timestamp}-{random}-{filename}
  if (key.match(/^\d+-[a-z0-9]+-/)) {
    return 'general'
  }

  return 'general'
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return createOptionsResponse()
}