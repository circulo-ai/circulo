import { existsSync } from "fs";
import path from "path";
import { createLogger, type Logger } from "./logger";
import type { FileParseResult, FileParser, SupportedFileType } from "./types";

let parserInstancesPromise: Promise<Record<string, FileParser>> | null = null;

type ParserLoaders = {
  [K in SupportedFileType]?: () => Promise<FileParser>;
};

function buildLoaders(logger: Logger): ParserLoaders {
  return {
    pdf: async () => {
      const { PdfParser } = await import("./pdf-parser.js");
      return new PdfParser(createLogger("PdfParser", logger));
    },
    csv: async () => {
      const { CsvParser } = await import("./csv-parser.js");
      return new CsvParser(createLogger("CsvParser", logger));
    },
    docx: async () => {
      const { DocxParser } = await import("./docx-parser.js");
      return new DocxParser(createLogger("DocxParser", logger));
    },
    doc: async () => {
      const { DocParser } = await import("./doc-parser.js");
      return new DocParser(createLogger("DocParser", logger));
    },
    txt: async () => {
      const { TxtParser } = await import("./txt-parser.js");
      return new TxtParser(createLogger("TxtParser", logger));
    },
    md: async () => {
      const { MdParser } = await import("./md-parser.js");
      return new MdParser(createLogger("MdParser", logger));
    },
    xlsx: async () => {
      const { XlsxParser } = await import("./xlsx-parser.js");
      return new XlsxParser(createLogger("XlsxParser", logger));
    },
    xls: async () => {
      const { XlsxParser } = await import("./xlsx-parser.js");
      return new XlsxParser(createLogger("XlsParser", logger));
    },
    pptx: async () => {
      const { PptxParser } = await import("./pptx-parser.js");
      return new PptxParser(createLogger("PptxParser", logger));
    },
    ppt: async () => {
      const { PptxParser } = await import("./pptx-parser.js");
      return new PptxParser(createLogger("PptParser", logger));
    },
    html: async () => {
      const { HtmlParser } = await import("./html-parser.js");
      return new HtmlParser(createLogger("HtmlParser", logger));
    },
    htm: async () => {
      const { HtmlParser } = await import("./html-parser.js");
      return new HtmlParser(createLogger("HtmParser", logger));
    },
    json: async () => {
      const { parseJSON, parseJSONBuffer } = await import("./json-parser.js");
      return {
        parseFile: parseJSON,
        parseBuffer: parseJSONBuffer,
      };
    },
    yaml: async () => {
      const { parseYAML, parseYAMLBuffer } = await import("./yaml-parser.js");
      return {
        parseFile: parseYAML,
        parseBuffer: parseYAMLBuffer,
      };
    },
    yml: async () => {
      const { parseYAML, parseYAMLBuffer } = await import("./yaml-parser.js");
      return {
        parseFile: parseYAML,
        parseBuffer: parseYAMLBuffer,
      };
    },
  };
}

async function getParserInstances(logger: Logger) {
  if (!parserInstancesPromise) {
    const loaders = buildLoaders(logger);
    parserInstancesPromise = (async () => {
      const entries = await Promise.all(
        Object.entries(loaders).map(async ([ext, loader]) => {
          try {
            const parser = await loader!();
            return [ext, parser] as const;
          } catch (error) {
            logger.error(`Failed to load parser for ${ext}:`, error);
            return null;
          }
        }),
      );
      const ready: Record<string, FileParser> = {};
      for (const entry of entries) {
        if (entry) ready[entry[0]] = entry[1];
      }
      return ready;
    })();
  }
  return parserInstancesPromise;
}

export type FileParserConfig = {
  logger?: Logger;
};

function normalizeExtension(ext: string): string {
  return ext.toLowerCase();
}

export function createFileParser(config: FileParserConfig = {}) {
  const logger = createLogger("FileParser", config.logger);

  async function parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const extension = normalizeExtension(path.extname(filePath).slice(1));
    const parsers = await getParserInstances(logger);
    const parser = parsers[extension];
    if (!parser) {
      throw new Error(
        `Unsupported file type: ${extension}. Supported types are: ${Object.keys(
          parsers,
        ).join(", ")}`,
      );
    }

    return parser.parseFile(filePath);
  }

  async function parseBuffer(
    buffer: Buffer,
    extension: string,
  ): Promise<FileParseResult> {
    if (!buffer || buffer.length === 0) {
      throw new Error("Empty buffer provided");
    }

    if (!extension) {
      throw new Error("No file extension provided");
    }

    const normalizedExtension = normalizeExtension(extension);
    const parsers = await getParserInstances(logger);
    const parser = parsers[normalizedExtension];
    if (!parser) {
      throw new Error(
        `Unsupported file type: ${normalizedExtension}. Supported types are: ${Object.keys(
          parsers,
        ).join(", ")}`,
      );
    }

    if (parser.parseBuffer) {
      return parser.parseBuffer(buffer);
    }
    throw new Error(
      `Parser for ${normalizedExtension} does not support buffer parsing`,
    );
  }

  async function isSupportedFileType(extension: string): Promise<boolean> {
    try {
      const parsers = await getParserInstances(logger);
      return Object.keys(parsers).includes(normalizeExtension(extension));
    } catch (error) {
      logger.error("Error checking supported file type:", error);
      return false;
    }
  }

  return { parseFile, parseBuffer, isSupportedFileType };
}

const defaultParser = createFileParser();

export const parseFile = defaultParser.parseFile;
export const parseBuffer = defaultParser.parseBuffer;
export const isSupportedFileType = defaultParser.isSupportedFileType;

export { CsvParser } from "./csv-parser";
export { DocParser } from "./doc-parser";
export { DocxParser } from "./docx-parser";
export { HtmlParser } from "./html-parser";
export { parseJSON, parseJSONBuffer } from "./json-parser";
export { MdParser } from "./md-parser";
export { PdfParser } from "./pdf-parser";
export { PptxParser } from "./pptx-parser";
export { TxtParser } from "./txt-parser";
export type { FileParseResult, FileParser, SupportedFileType } from "./types";
export { XlsxParser } from "./xlsx-parser";
export { parseYAML, parseYAMLBuffer } from "./yaml-parser";
