import type { ParsedAttachmentPreview } from "@/lib/attachment-preview";

self.onmessage = async (
  event: MessageEvent<{ kind: "document" | "spreadsheet"; bytes: ArrayBuffer }>,
) => {
  if (event.origin !== self.location.origin) return;
  try {
    let result: ParsedAttachmentPreview;
    if (event.data.kind === "document") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({
        arrayBuffer: event.data.bytes,
      });
      result = {
        kind: "document",
        text: value.slice(0, 200_000),
        truncated: value.length > 200_000,
      };
    } else {
      const xlsx = await import("xlsx");
      xlsx.set_cptable(await import("xlsx/dist/cpexcel.full.mjs"));
      const book = xlsx.read(event.data.bytes, {
        type: "array",
        sheetRows: 201,
        cellFormula: false,
        cellHTML: false,
        bookVBA: false,
      });
      const sheets = book.SheetNames.slice(0, 20).map((name) => ({
        name,
        rows: xlsx.utils
          .sheet_to_json<string[]>(book.Sheets[name], {
            header: 1,
            raw: false,
            blankrows: false,
            range: { s: { r: 0, c: 0 }, e: { r: 200, c: 49 } },
          })
          .slice(0, 200)
          .map((row) => row.slice(0, 50).map((cell) => String(cell ?? ""))),
      }));
      result = {
        kind: "spreadsheet",
        sheets,
        truncated:
          book.SheetNames.length > 20 ||
          sheets.some(
            (sheet) =>
              sheet.rows.length >= 200 ||
              sheet.rows.some((row) => row.length >= 50),
          ),
      };
    }
    self.postMessage({ result });
  } catch {
    self.postMessage({
      error:
        "This file could not be previewed. It may be damaged or use an unsupported format. Download the original to open it.",
    });
  }
};
