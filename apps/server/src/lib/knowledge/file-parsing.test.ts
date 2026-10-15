import { parseBuffer, isSupportedFileType } from "@circulo-ai/file-parsers";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

describe("file ingestion", () => {
  it.each([
    "txt",
    ".MD",
    "ts",
    "py",
    "xml",
    "toml",
    "log",
  ])("parses %s text without loading Office parsers", async (extension) => {
    expect(
      (await parseBuffer(Buffer.from("Source content"), extension)).content,
    ).toBe("Source content");
  });
  it("decodes UTF-16 text and rejects disguised binaries", async () => {
    const unicode = "سلام 😀 𐐀";
    expect((await parseBuffer(Buffer.from(unicode), "txt")).content).toBe(
      unicode,
    );
    const utf16 = Buffer.concat([
      Buffer.from([255, 254]),
      Buffer.from("Unicode text", "utf16le"),
    ]);
    expect((await parseBuffer(utf16, "txt")).content).toBe("Unicode text");
    await expect(
      parseBuffer(Buffer.from([0, 255, 200]), "txt"),
    ).rejects.toThrow();
    await expect(parseBuffer(Buffer.from("not a PDF"), "pdf")).rejects.toThrow(
      "valid PDF",
    );
    await expect(
      parseBuffer(Buffer.from("invalid archive"), "pptx"),
    ).rejects.toThrow("Office archive");
  });
  it("ingests every CSV row rather than silently truncating after 1,000", async () => {
    const csv = `Name,Value\n${Array.from({ length: 1200 }, (_, index) => `row${index},${index}`).join("\n")}`;
    const result = await parseBuffer(Buffer.from(csv), "csv");
    expect(result.content).toContain("row1199");
    expect(result.metadata?.truncated).toBe(false);
  });
  it("parses TSV, structured text, and HTML", async () => {
    expect(
      (await parseBuffer(Buffer.from("Name\tValue\nnotes\t42"), "tsv")).content,
    ).toContain("notes, 42");
    expect(
      (await parseBuffer(Buffer.from('{"project":"Circulo"}'), "json")).content,
    ).toContain("Circulo");
    expect(
      (await parseBuffer(Buffer.from("project: Circulo"), "yaml")).content,
    ).toContain("Circulo");
    expect(
      (
        await parseBuffer(
          Buffer.from("<main><h1>Circulo</h1><script>hidden()</script></main>"),
          "html",
        )
      ).content,
    ).toContain("Circulo");
    expect(
      (
        await parseBuffer(
          Buffer.from("<main>visible<script>hidden()</script></main>"),
          "html",
        )
      ).content,
    ).not.toContain("hidden");
    await expect(
      parseBuffer(Buffer.from("a: &a [*a]"), "yaml"),
    ).rejects.toThrow("Cyclic");
  });
  it("rejects unsupported legacy presentations promptly", async () => {
    expect(await isSupportedFileType("ppt")).toBe(false);
    await expect(parseBuffer(Buffer.from("legacy"), "ppt")).rejects.toThrow(
      "Convert legacy .ppt",
    );
  });
  it.each([
    "presentation.pptx",
    "document.docx",
    "document.odt",
    "document.pdf",
    "workbook.xlsx",
    "workbook.ods",
  ])("extracts %s through the actual parser", async (filename) => {
    const buffer = await readFile(
      fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url)),
    );
    expect(
      (await parseBuffer(buffer, filename.split(".").at(-1)!)).content,
    ).toContain("Parser verification");
  });
});
