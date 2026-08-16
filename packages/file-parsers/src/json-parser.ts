import type { FileParseResult } from "./types.js";

export async function parseJSON(filePath: string): Promise<FileParseResult> {
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  return {
    content,
    metadata: { parsed },
  };
}

export async function parseJSONBuffer(
  buffer: Buffer,
): Promise<FileParseResult> {
  const content = buffer.toString("utf8");
  const parsed = JSON.parse(content);
  return {
    content,
    metadata: { parsed },
  };
}
