import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { createLogger, type Logger } from "./logger.js";
import type { FileParseResult, FileParser } from "./types.js";
import { sanitizeTextArray, sanitizeTextForUTF8 } from "./utils.js";

export class XlsxParser implements FileParser {
  constructor(readonly _logger: Logger = createLogger("XlsxParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    if (!filePath) {
      throw new Error("No file path provided");
    }
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.parseBuffer(await readFile(filePath));
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    XLSX.set_cptable(await import("xlsx/dist/cpexcel.full.mjs"));
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
      const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
      if ((range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > 1000000)
        throw new Error(
          "Spreadsheet range exceeds one million cells; split the sheet",
        );
      if (sheets.length > 100)
        throw new Error("Spreadsheets must contain at most 100 sheets");

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
      if (content.length > 500000)
        throw new Error(
          "Spreadsheet text exceeds 500,000 characters; split the file",
        );
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
