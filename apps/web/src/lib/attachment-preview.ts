import { getSafeNavigationUrl } from "@/lib/urls/safe";

export type AttachmentPreviewKind =
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "text"
  | "document"
  | "spreadsheet"
  | "file";
export type ParsedAttachmentPreview =
  | { kind: "document"; text: string; truncated: boolean }
  | {
      kind: "spreadsheet";
      sheets: Array<{ name: string; rows: string[][] }>;
      truncated: boolean;
    };

const textExtensions = new Set(
  "txt text md markdown json jsonl csv tsv yaml yml toml xml html htm css scss sass js jsx ts tsx mjs cjs py rb rs go java kt kts c cpp h hpp cs sh bash zsh ps1 sql log env ini conf dockerfile".split(
    " ",
  ),
);
const imageExtensions = new Set(
  "png jpg jpeg gif webp avif bmp svg ico".split(" "),
);
const audioExtensions = new Set(
  "mp3 wav m4a aac ogg opus flac webm".split(" "),
);
const videoExtensions = new Set("mp4 mov m4v avi mkv webm".split(" "));

export function getAttachmentPreviewKind(
  name: string,
  contentType = "",
): AttachmentPreviewKind {
  const mime = contentType.toLowerCase().split(";")[0];
  const extension = name.toLowerCase().split(".").pop() ?? "";
  // Browsers sometimes label TypeScript source as video/mp2t.
  if (textExtensions.has(extension) && !["csv", "tsv"].includes(extension))
    return "text";
  if (mime.startsWith("image/") || imageExtensions.has(extension))
    return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/") || videoExtensions.has(extension))
    return "video";
  if (audioExtensions.has(extension)) return "audio";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (["xlsx", "xls", "ods", "csv", "tsv"].includes(extension))
    return "spreadsheet";
  if (
    extension === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "document";
  if (
    mime.startsWith("text/") ||
    textExtensions.has(extension) ||
    mime === "application/json"
  )
    return "text";
  return "file";
}

export function getAttachmentPreviewUrl(
  value?: string | null,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (
    /^blob:https?:\/\//i.test(trimmed) ||
    /^data:[\w.+/-]+(?:;[^,]*)?,/i.test(trimmed)
  )
    return trimmed;
  return getSafeNavigationUrl(trimmed);
}

export function formatAttachmentSize(size?: number | null) {
  if (size == null || size < 0) return undefined;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** FileReader data URLs are local bytes, so decoding them needs no network permission. */
export function readInlinePreviewBytes(
  source: string,
  limit: number,
  truncate = false,
) {
  const match = /^data:([\w.+/-]+)(?:;[^,]*)?;base64,([\s\S]*)$/i.exec(source);
  if (!match)
    throw new Error(
      "This inline file encoding is not supported. Download the original to open it.",
    );
  const encoded = match[2];
  const byteLength =
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (byteLength > limit && !truncate)
    throw new Error(
      "This file is too large for an inline preview. Download the original to open it.",
    );
  const prefix = encoded.slice(0, Math.ceil((limit + 1) / 3) * 4);
  const decoded = atob(prefix);
  const bytes = Uint8Array.from(decoded.slice(0, limit), (character) =>
    character.charCodeAt(0),
  );
  return { bytes, truncated: byteLength > limit };
}

/** Read at most limit bytes, cancelling the body instead of buffering an unbounded file. */
export async function readPreviewBytes(
  response: Response,
  limit: number,
  truncate = false,
) {
  if (!response.ok)
    throw new Error(
      "The file could not be loaded. Try again or download the original.",
    );
  const length = Number(response.headers.get("content-length"));
  if (!truncate && length > limit) {
    await response.body?.cancel();
    throw new Error(
      "This file is too large for an inline preview. Download the original to open it.",
    );
  }
  if (!response.body) throw new Error("The file response is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (total + value.byteLength > limit) {
        if (!truncate)
          throw new Error(
            "This file is too large for an inline preview. Download the original to open it.",
          );
        chunks.push(value.subarray(0, limit - total));
        total = limit;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}
