export interface FileParseResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface FileParser {
  parseFile(filePath: string): Promise<FileParseResult>;
  parseBuffer?(buffer: Buffer): Promise<FileParseResult>;
}

export type SupportedFileType =
  | "pdf"
  | "csv"
  | "doc"
  | "docx"
  | "txt"
  | "md"
  | "xlsx"
  | "xls"
  | "html"
  | "htm"
  | "pptx"
  | "ppt"
  | "json"
  | "yaml"
  | "yml";
