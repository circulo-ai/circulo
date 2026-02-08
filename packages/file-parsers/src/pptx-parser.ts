import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class PptxParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("PptxParser")) {}

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
    const officeParser = await import("officeparser");
    const parsed = await new Promise<{ value: string; metadata?: unknown }>(
      (resolve, reject) => {
        (officeParser as any).parseOfficeAsync(
          buffer,
          {
            contentType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          },
          (err: unknown, data: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          },
        );
      },
    );

    const content = sanitizeTextForUTF8(parsed?.value ?? "");

    return {
      content,
      metadata: {
        meta: parsed?.metadata,
        characterCount: content.length,
        tokenCount: Math.floor(content.length / 4),
        source: "officeparser",
      },
    };
  }
}
