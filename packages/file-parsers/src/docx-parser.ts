import { readFile } from "fs/promises";
import mammoth from "mammoth";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class DocxParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("DocxParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    const data = await readFile(filePath);
    return this.parseBuffer(data);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    this.logger.info(
      `Parsing DOCX buffer, size: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
    );

    const result = await mammoth.extractRawText({ buffer });
    const content = sanitizeTextForUTF8(result.value || "");

    return {
      content,
      metadata: {
        warnings: result.messages,
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
        source: "mammoth",
      },
    };
  }
}
