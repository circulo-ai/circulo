import { unzipSync } from "fflate";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextForUTF8 } from "./utils.js";

export class PptxParser implements FileParser {
  constructor(
    readonly _logger: Logger = createLogger("PptxParser"),
    private readonly fileType: "odt" | "odp" | "pptx" = "pptx",
  ) {}

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
    const OfficeParser = officeParser.OfficeParser ?? officeParser.default;
    let content: string;
    try {
      const ast = await OfficeParser.parseOffice(buffer, {
        fileType: this.fileType,
        outputErrorToConsole: false,
        newlineDelimiter: "\n",
      });
      content = ast.toText();
    } catch (error) {
      if (this.fileType !== "pptx") throw error;
      content = extractSlideText(buffer) ?? throwParserError(error);
    }
    content = sanitizeTextForUTF8(content);

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

function extractSlideText(buffer: Buffer): string | undefined {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(buffer);
  } catch {
    return undefined;
  }
  const slidePaths = Object.keys(archive)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  if (slidePaths.length === 0 || "ppt/presentation.xml" in archive) {
    return undefined;
  }
  return slidePaths
    .flatMap((path) => {
      const xml = new TextDecoder().decode(archive[path]);
      return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(
        (match) => decodeXmlText(match[1] ?? ""),
      );
    })
    .join("\n");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function throwParserError(error: unknown): never {
  throw error;
}
