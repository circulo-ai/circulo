export interface FileParseResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface FileParser {
  parseFile(filePath: string): Promise<FileParseResult>;
  parseBuffer?(buffer: Buffer): Promise<FileParseResult>;
}

export type SupportedFileType =
  typeof import("./index.js").SUPPORTED_FILE_EXTENSIONS[number];
