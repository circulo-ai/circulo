import { readFile } from "fs/promises";
import { createLogger, type Logger } from "./logger";
import type { FileParseResult, FileParser } from "./types";
import { sanitizeTextForUTF8 } from "./utils";

export class TxtParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("TxtParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    const buffer = await readFile(filePath);
    return this.parseBuffer(buffer);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    const content = sanitizeTextForUTF8(buffer.toString("utf8"));
    return {
      content,
      metadata: {
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
      },
    };
  }
}
