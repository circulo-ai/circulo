import { readFile } from "node:fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";
import { decodeTextBuffer } from "./validation.js";

export class TxtParser implements FileParser {
  constructor(readonly _logger: Logger = createLogger("TxtParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    const buffer = await readFile(filePath);
    return this.parseBuffer(buffer);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    const content = sanitizeTextForUTF8(decodeTextBuffer(buffer));
    return {
      content,
      metadata: {
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
      },
    };
  }
}
