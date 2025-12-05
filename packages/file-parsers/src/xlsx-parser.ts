import { existsSync } from "fs";
import * as XLSX from "xlsx";
import type { FileParseResult, FileParser } from "./types";
import { sanitizeTextForUTF8, sanitizeTextArray } from "./utils";
import { createLogger, type Logger } from "./logger";

export class XlsxParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("XlsxParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    return this.parseWorkbook(workbook);
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return this.parseWorkbook(workbook);
  }

  private parseWorkbook(workbook: XLSX.WorkBook): FileParseResult {
    const sheets = workbook.SheetNames;
    const metadata: Record<string, unknown> = {
      sheetNames: sheets,
      sheetCount: sheets.length,
    };

    let content = "";

    sheets.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return;

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
      }) as unknown[][];

      content += `### Sheet: ${sheetName}\n`;
      const sanitizedRows = rows.map((row) =>
        sanitizeTextArray(row.map((cell) => String(cell ?? ""))),
      );
      content += sanitizedRows.map((r) => r.join(", ")).join("\n");
      content += "\n\n";
    });

    content = sanitizeTextForUTF8(content);

    metadata.characterCount = content.length;
    metadata.tokenCount = Math.floor(content.length / 4);

    return {
      content,
      metadata,
    };
  }
}
