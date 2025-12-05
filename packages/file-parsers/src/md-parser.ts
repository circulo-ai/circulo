import { readFile } from "fs/promises";
import type { FileParseResult, FileParser } from "./types";
import { sanitizeTextForUTF8 } from "./utils";
import { createLogger, type Logger } from "./logger";

export class MdParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("MdParser")) {}

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
