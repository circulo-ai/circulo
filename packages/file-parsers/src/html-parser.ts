import * as cheerio from "cheerio";
import { readFile } from "fs/promises";
import { createLogger, type Logger } from "./logger";
import type { FileParseResult, FileParser } from "./types";
import { sanitizeTextForUTF8 } from "./utils";

export class HtmlParser implements FileParser {
  constructor(private readonly logger: Logger = createLogger("HtmlParser")) {}

  async parseFile(filePath: string): Promise<FileParseResult> {
    const html = await readFile(filePath, "utf8");
    return this.parseBuffer(Buffer.from(html));
  }

  async parseBuffer(buffer: Buffer): Promise<FileParseResult> {
    const html = buffer.toString("utf8");
    const $ = cheerio.load(html);
    const text = sanitizeTextForUTF8($.text());

    const title = $("title").first().text() || undefined;
    const headings = $("h1,h2,h3,h4,h5,h6")
      .map((_, el) => $(el).text())
      .get()
      .map((t) => sanitizeTextForUTF8(t));

    return {
      content: text,
      metadata: {
        title,
        headings,
        length: text.length,
        characterCount: text.length,
        tokenCount: Math.floor(text.length / 4),
        source: "cheerio",
      },
    };
  }
}
