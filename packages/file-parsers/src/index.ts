import { open } from "node:fs/promises";
import path from "node:path";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";

type ParserLoaders = Record<string, () => Promise<FileParser>>;
export const TEXT_FILE_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "log",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "java",
  "rs",
  "go",
  "c",
  "cpp",
  "h",
  "css",
  "scss",
  "sql",
  "sh",
  "ps1",
  "toml",
  "xml",
  "ini",
  "env",
  "jsonl",
] as const;
export const SUPPORTED_FILE_EXTENSIONS = [
  ...TEXT_FILE_EXTENSIONS,
  "pdf",
  "csv",
  "tsv",
  "doc",
  "docx",
  "xlsx",
  "xls",
  "ods",
  "odt",
  "odp",
  "html",
  "htm",
  "pptx",
  "json",
  "yaml",
  "yml",
] as const;

function buildLoaders(logger: Logger): ParserLoaders {
  return {
    ...Object.fromEntries(
      TEXT_FILE_EXTENSIONS.map((extension) => [
        extension,
        async () => {
          const { TxtParser } = await import("./txt-parser.js");
          return new TxtParser(createLogger("TxtParser", logger));
        },
      ]),
    ),
    tsv: async () => {
      const { CsvParser } = await import("./csv-parser.js");
      return new CsvParser(createLogger("CsvParser", logger), "\t");
    },
    ...Object.fromEntries(
      ["odt", "odp"].map((extension) => [
        extension,
        async () => {
          const { PptxParser } = await import("./pptx-parser.js");
          return new PptxParser(
            createLogger("OfficeParser", logger),
            extension as "odt" | "odp",
          );
        },
      ]),
    ),
    ods: async () => {
      const { XlsxParser } = await import("./xlsx-parser.js");
      return new XlsxParser(createLogger("XlsxParser", logger));
    },
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

export type FileParserConfig = {
  logger?: Logger;
};

function normalizeExtension(ext: string): string {
  return ext.trim().replace(/^\./, "").toLowerCase();
}

export function createFileParser(config: FileParserConfig = {}) {
  const logger = createLogger("FileParser", config.logger);
  const loaders = buildLoaders(logger);
  const parsers = new Map<string, Promise<FileParser>>();
  function getParser(extension: string): Promise<FileParser> {
    const loader = loaders[extension];
    if (!loader)
      throw new Error(
        `Unsupported file type: ${extension}. Supported types: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}. Convert legacy .ppt presentations to .pptx.`,
      );
    let parser = parsers.get(extension);
    if (!parser) {
      parser = loader().catch((error) => {
        parsers.delete(extension);
        throw error;
      });
      parsers.set(extension, parser);
    }
    return parser;
  }

  async function parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }

    const extension = normalizeExtension(path.extname(filePath).slice(1));
    const file = await open(filePath, "r");
    try {
      if ((await file.stat()).size > 25 * 1024 * 1024) {
        throw new Error("Files must be 25 MB or smaller");
      }
      return parseBuffer(await file.readFile(), extension);
    } finally {
      await file.close();
    }
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

    if (buffer.length > 25 * 1024 * 1024)
      throw new Error("Files must be 25 MB or smaller");
    const normalizedExtension = normalizeExtension(extension);
    const { validateParserBuffer, decodeTextBuffer } =
      await import("./validation.js");
    validateParserBuffer(buffer, normalizedExtension);
    if (
      [
        ...TEXT_FILE_EXTENSIONS,
        "csv",
        "tsv",
        "json",
        "yaml",
        "yml",
        "html",
        "htm",
      ].includes(normalizedExtension)
    ) {
      const text = decodeTextBuffer(buffer);
      if (text.length > 500000)
        throw new Error("Text exceeds 500,000 characters; split the document");
      buffer = Buffer.from(text, "utf8");
    }
    const parser = await getParser(normalizedExtension);
    if (!parser.parseBuffer)
      throw new Error(`Parser for ${normalizedExtension} cannot parse buffers`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        parser.parseBuffer(buffer),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("File parsing timed out; split or convert the file"),
              ),
            30000,
          );
        }),
      ]);
      if (result.content.length > 500000)
        throw new Error(
          "Parsed text exceeds 500,000 characters; split the document",
        );
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function isSupportedFileType(extension: string): Promise<boolean> {
    return Boolean(loaders[normalizeExtension(extension)]);
  }

  return { parseFile, parseBuffer, isSupportedFileType };
}

const defaultParser = createFileParser();

export const parseFile = defaultParser.parseFile;
export const parseBuffer = defaultParser.parseBuffer;
export const isSupportedFileType = defaultParser.isSupportedFileType;

export { CsvParser } from "./csv-parser.js";
export { DocParser } from "./doc-parser.js";
export { DocxParser } from "./docx-parser.js";
export { HtmlParser } from "./html-parser.js";
export { parseJSON, parseJSONBuffer } from "./json-parser.js";
export { MdParser } from "./md-parser.js";
export { PdfParser } from "./pdf-parser.js";
export { PptxParser } from "./pptx-parser.js";
export { TxtParser } from "./txt-parser.js";
export type { FileParseResult, FileParser } from "./types.js";
export { XlsxParser } from "./xlsx-parser.js";
export { parseYAML, parseYAMLBuffer } from "./yaml-parser.js";
