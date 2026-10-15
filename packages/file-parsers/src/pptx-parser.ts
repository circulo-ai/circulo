import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class PptxParser implements FileParser {
  constructor(readonly _logger: Logger = createLogger("PptxParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buffer = await readFile(filePath);
    return this.parseBuffer(buffer);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    const { parseOfficeAsync } = await import("officeparser");
    const content = sanitizeTextForUTF8(
      await parseOfficeAsync(buffer, {
        outputErrorToConsole: false,
        newlineDelimiter: "\n",
      }),
    );

    return {
      content,
      metadata: {
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
        source: "officeparser",
      },
    };
  }
}
