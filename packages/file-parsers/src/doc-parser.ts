import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class DocParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("DocParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.logger.info(`Parsing DOC file: ${filePath}`);
    const buffer = await readFile(filePath);
    return this.parseBuffer(buffer);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    this.logger.info(
      `Parsing DOC buffer, size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(2)} KB)`,
    );

    const { default: WordExtractor } = await import("word-extractor");
    const parsed = await new WordExtractor().extract(buffer);
    const content = sanitizeTextForUTF8(
      [
        parsed.getBody(),
        parsed.getHeaders(),
        parsed.getFootnotes(),
        parsed.getEndnotes(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    return {
      content,
      metadata: {
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
        source: "word-extractor",
      },
    };
  }
}
