import { readFile } from 'fs/promises'
import type { FileParseResult, FileParser } from './types'
import { sanitizeTextForUTF8 } from './utils'
import { createLogger } from '@/lib/logs/console/logger';

const logger = createLogger('PdfParser')

export class PdfParser implements FileParser {
  async parseFile(filePath: string): Promise<FileParseResult> {
    try {
      logger.info('Starting to parse file:', filePath)

      if (!filePath) {
        throw new Error('No file path provided')
      }

      logger.info('Reading file...')
      const dataBuffer = await readFile(filePath)
      logger.info('File read successfully, size:', dataBuffer.length)

      return this.parseBuffer(dataBuffer)
    } catch (error) {
      logger.error('Error reading file:', error)
      throw error
    }
  }

  async parseBuffer(dataBuffer: Buffer): Promise<FileParseResult> {
    try {
      logger.info('Starting to parse buffer, size:', dataBuffer.length)

      // Dynamically import to work with ESM/CJS variations
      const mod = await import('pdf-parse')
      const defaultExport = (mod as any).default
      const nodeClass = (mod as any).PDFParse || (mod as any).PDFParser

      // Path A: default function export (standard usage)
      if (typeof defaultExport === 'function') {
        logger.info('Using pdf-parse default function export')
        const result = await defaultExport(dataBuffer)

        const content = sanitizeTextForUTF8((result?.text as string) || '')
        const pageCount =
          (result as any)?.numpages ??
          (result as any)?.numPages ??
          (result as any)?.info?.Pages ??
          (result as any)?.metadata?.numpages
        const resolvedPageCount = this.resolvePageCount(pageCount, dataBuffer, content)

        logger.info(
          'PDF parsed successfully (function), pages:',
          resolvedPageCount,
          'text length:',
          content.length
        )

        return {
          content,
          metadata: {
            pageCount: resolvedPageCount,
            info: (result as any)?.info,
            version: (result as any)?.version,
            meta: (result as any)?.metadata,
            characterCount: content.length,
            tokenCount: Math.floor(content.length / 4),
            source: 'pdf-parse',
          },
        }
      }

      // Path B: class export (node build)
      if (typeof nodeClass === 'function') {
        logger.info('Using PDFParse class export (node build)')
        const parser = new nodeClass({ data: dataBuffer })
        try {
          const [textResult, infoResult] = await Promise.all([
            parser.getText(),
            parser.getInfo().catch(() => undefined),
          ])

          const content = sanitizeTextForUTF8((textResult as any)?.text || '')
          const pageCount =
            (textResult as any)?.total ??
            (infoResult as any)?.numPages ??
            (infoResult as any)?.numpages
          const resolvedPageCount = this.resolvePageCount(pageCount, dataBuffer, content)

          logger.info(
            'PDF parsed successfully (class), pages:',
            resolvedPageCount,
            'text length:',
            content.length
          )

          return {
            content,
            metadata: {
              pageCount: resolvedPageCount,
              info: (infoResult as any)?.info,
              version: (infoResult as any)?.version,
              meta: (infoResult as any)?.metadata,
              characterCount: content.length,
              tokenCount: Math.floor(content.length / 4),
              source: 'pdf-parse-node',
            },
          }
        } finally {
          if (typeof parser.destroy === 'function') {
            await parser.destroy()
          }
        }
      }

      throw new Error('pdf-parse module did not provide a supported export (function or class)')
    } catch (error) {
      logger.error('Error parsing buffer:', error)
      throw error
    }
  }

  /**
   * Resolve page count using API result first, then fall back to raw buffer analysis.
   * Guarantees a non-negative integer, assuming 1 page if content exists and no explicit count is found.
   */
  private resolvePageCount(
    apiPageCount: unknown,
    dataBuffer: Buffer,
    content: string
  ): number {
    const num = Number(apiPageCount)
    if (Number.isFinite(num) && num > 0) return Math.floor(num)

    // Fallback: count occurrences of "/Type /Page" in raw PDF bytes (latin1 preserves bytes)
    try {
      const raw = dataBuffer.toString('latin1')
      const matches = raw.match(/\/Type\s*\/Page\b/g)
      const count = matches?.length ?? 0
      if (count > 0) {
        logger.info(`Resolved page count from buffer markers: ${count}`)
        return count
      }
    } catch (e) {
      logger.warn('Failed buffer-based page count analysis:', e)
    }

    // Conservative default: assume 1 page if content exists
    if (content && content.length > 0) {
      logger.info('No explicit page markers found, assuming 1 page based on content presence')
      return 1
    }

    // No content and no markers
    return 0
  }
}
