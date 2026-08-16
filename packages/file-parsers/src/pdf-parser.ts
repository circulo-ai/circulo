import { readFile } from "fs/promises";
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

    const mod = await import("pdf-parse");
    const defaultExport = (mod as any).default;
    const nodeClass = (mod as any).PDFParse || (mod as any).PDFParser;

    // Function export path
    if (typeof defaultExport === "function") {
      const result = await defaultExport(dataBuffer);

      const content = sanitizeTextForUTF8((result?.text as string) || "");
      const pageCount =
        (result as any)?.numpages ??
        (result as any)?.numPages ??
        (result as any)?.info?.Pages ??
        (result as any)?.metadata?.numpages;
      const resolvedPageCount = this.resolvePageCount(
        pageCount,
        dataBuffer,
        content,
      );

      return {
        content,
        metadata: {
          pageCount: resolvedPageCount,
          info: (result as any)?.info,
          version: (result as any)?.version,
          meta: (result as any)?.metadata,
          characterCount: content.length,
          tokenCount: Math.floor(content.length / 4),
          source: "pdf-parse",
        },
      };
    }

    // Class export path
    if (typeof nodeClass === "function") {
      const parser = new nodeClass({ data: dataBuffer });
      try {
        const [textResult, infoResult] = await Promise.all([
          parser.getText(),
          parser.getInfo().catch(() => undefined),
        ]);

        const content = sanitizeTextForUTF8((textResult as any)?.text || "");
        const pageCount =
          (textResult as any)?.total ??
          (infoResult as any)?.numPages ??
          (infoResult as any)?.numpages;
        const resolvedPageCount = this.resolvePageCount(
          pageCount,
          dataBuffer,
          content,
        );

        return {
          content,
          metadata: {
            pageCount: resolvedPageCount,
            info: (infoResult as any)?.info,
            version: (infoResult as any)?.version,
            meta: (infoResult as any)?.metadata,
            characterCount: content.length,
            tokenCount: Math.floor(content.length / 4),
            source: "pdf-parse-node",
          },
        };
      } finally {
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      }
    }

    throw new Error(
      "pdf-parse module did not provide a supported export (function or class)",
    );
  }

  private resolvePageCount(
    apiPageCount: unknown,
    dataBuffer: Buffer,
    content: string,
  ): number {
    const num = Number(apiPageCount);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);

    try {
      const raw = dataBuffer.toString("latin1");
      const matches = raw.match(/\/Type\s*\/Page\b/g);
      const count = matches?.length ?? 0;
      if (count > 0) {
        return count;
      }
    } catch (e) {
      this.logger.warn("Failed buffer-based page count analysis:", e);
    }

    if (content && content.length > 0) {
      return 1;
    }

    return 0;
  }
}
