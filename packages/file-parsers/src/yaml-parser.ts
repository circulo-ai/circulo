import * as yaml from "js-yaml";
import type { FileParseResult } from "./types.js";

export async function parseYAML(filePath: string): Promise<FileParseResult> {
  const fs = await import("fs/promises");
  const fileContents = await fs.readFile(filePath, "utf8");
  const parsed = yaml.load(fileContents);
  return {
    content: fileContents,
    metadata: { parsed },
  };
}

export async function parseYAMLBuffer(
  buffer: Buffer,
): Promise<FileParseResult> {
  const fileContents = buffer.toString("utf8");
  const parsed = yaml.load(fileContents);
  return {
    content: fileContents,
    metadata: { parsed },
  };
}
