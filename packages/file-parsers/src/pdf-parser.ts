import { readFile } from "node:fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class PdfParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("PdfParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    this.logger.info("Parsing PDF file:", filePath);
    const dataBuffer = await readFile(filePath);
    return this.parseBuffer(dataBuffer);
  }

  async parseBuffer(dataBuffer: Buffer): Promise<FileParseResult> {
    this.logger.info("Parsing PDF buffer, bytes:", dataBuffer.length);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataBuffer) });
    try {
      const document = await loadingTask.promise;
      const pageText: string[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        for (const item of textContent.items) {
          if ("str" in item) {
            pageText.push(item.str);
            pageText.push(item.hasEOL ? "\n" : " ");
          }
        }
        page.cleanup();
      }

      const content = sanitizeTextForUTF8(pageText.join("").trim());
      let info: Record<string, unknown> | undefined;
      try {
        const metadata = await document.getMetadata();
        info = metadata.info as Record<string, unknown>;
      } catch (error) {
        this.logger.warn("Failed to read PDF metadata:", error);
      }

      return {
        content,
        metadata: {
          pageCount: document.numPages,
          info,
          version: info?.["PDFFormatVersion"],
          characterCount: content.length,
          tokenCount: Math.floor(content.length / 4),
          source: "pdfjs-dist",
        },
      };
    } finally {
      await loadingTask.destroy();
    }
  }
}
