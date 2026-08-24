import type { ChatMessage } from "@/lib/types";
import { parseBuffer } from "@circulo-ai/file-parsers";

const MAX_ATTACHMENT_BYTES_TO_PARSE = 16 * 1024 * 1024;
const MAX_ATTACHMENT_CONTEXT_CHARACTERS = 40_000;
const MAX_TOTAL_ATTACHMENT_CONTEXT_CHARACTERS = 160_000;
const MAX_INLINE_BINARY_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_IMAGES = 4;

type MessagePart = Record<string, unknown> & { type?: unknown };

const PARSABLE_EXTENSIONS = new Set([
  "pdf",
  "csv",
  "doc",
  "docx",
  "txt",
  "md",
  "xlsx",
  "xls",
  "html",
  "htm",
  "pptx",
  "ppt",
  "json",
  "yaml",
  "yml",
]);

const TEXT_EXTENSIONS = new Set([
  "csv",
  "html",
  "htm",
  "json",
  "md",
  "txt",
  "yaml",
  "yml",
]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getFileName(part: MessagePart): string {
  return stringValue(part.filename) ?? stringValue(part.name) ?? "attachment";
}

function getMediaType(part: MessagePart): string {
  return (
    stringValue(part.mediaType) ??
    stringValue(part.contentType) ??
    "application/octet-stream"
  );
}

function getExtension(fileName: string, mediaType: string): string | undefined {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension && PARSABLE_EXTENSIONS.has(extension)) return extension;

  const mediaTypeExtension: Record<string, string> = {
    "application/pdf": "pdf",
    "application/rtf": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "text/csv": "csv",
    "text/html": "html",
    "text/markdown": "md",
    "text/plain": "txt",
    "application/json": "json",
    "application/yaml": "yaml",
    "text/yaml": "yaml",
  };
  return mediaTypeExtension[mediaType.toLowerCase()];
}

function decodeDataUrl(value: string): Buffer | undefined {
  const match = value.match(/^data:[^;,]+(?:;[^;,]+)*,([\s\S]*)$/i);
  if (!match?.[1]) return undefined;

  const metadata = value.slice(0, value.indexOf(","));
  try {
    return /;base64/i.test(metadata)
      ? Buffer.from(match[1], "base64")
      : Buffer.from(decodeURIComponent(match[1]), "utf8");
  } catch {
    return undefined;
  }
}

async function getChatStorageKey(value: string): Promise<string | undefined> {
  // Only relative URLs produced by Circulo's attachment pipeline may be
  // resolved through the internal storage manager. Absolute remote URLs must
  // remain provider references even if they use the same path or query names;
  // otherwise an attacker could turn an arbitrary attachment into a local
  // storage read.
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(value, "http://circulo.local");
  } catch {
    return undefined;
  }

  const servePrefix = "/api/files/serve/";
  if (parsed.pathname.startsWith(servePrefix)) {
    const encodedKey = parsed.pathname.slice(servePrefix.length);
    if (!encodedKey) return undefined;
    try {
      const key = decodeURIComponent(encodedKey);
      const token = parsed.searchParams.get("token");
      if (!token) return undefined;

      const { verifyFileAccessToken } =
        await import("@/lib/storage/file-access-token");
      const context = parsed.searchParams.get("context") ?? "general";
      if (context !== "chat") return undefined;
      return verifyFileAccessToken(key, context, token) ? key : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function loadAttachmentBuffer(
  part: MessagePart,
): Promise<Buffer | undefined> {
  const candidates = [part.dataUrl, part.downloadUrl, part.url]
    .map(stringValue)
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const dataBuffer = decodeDataUrl(candidate);
    if (dataBuffer) return dataBuffer;

    const key = await getChatStorageKey(candidate);
    if (!key) continue;

    try {
      const { storageManager } = await import("@/lib/storage/config");
      return await storageManager.download({ context: "chat", key });
    } catch {
      // A remote URL may still be usable by the model provider. Keep trying
      // other representations before leaving the original file part intact.
    }
  }

  return undefined;
}

function toDataUrl(mediaType: string, buffer: Buffer): string {
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

function asTextAttachment(
  fileName: string,
  content: string,
  maxCharacters: number,
): MessagePart {
  const boundedContent = content.slice(0, maxCharacters);
  const truncated = content.length > boundedContent.length;
  return {
    type: "text",
    text: [
      `[Attached file: ${fileName}]`,
      boundedContent,
      ...(truncated
        ? ["[Attachment content truncated for context limits]"]
        : []),
    ].join("\n"),
  };
}

type AttachmentContextBudget = {
  remainingTextCharacters: number;
  remainingInlineBytes: number;
  inlineImageCount: number;
};

async function normalizeFilePart(
  part: MessagePart,
  budget: AttachmentContextBudget,
): Promise<MessagePart> {
  const fileName = getFileName(part);
  const mediaType = getMediaType(part);
  const extension = getExtension(fileName, mediaType);
  const buffer = await loadAttachmentBuffer(part);

  const transcript = stringValue(part.transcript);
  if (transcript && mediaType.startsWith("audio/")) {
    const maxCharacters = Math.min(
      MAX_ATTACHMENT_CONTEXT_CHARACTERS,
      budget.remainingTextCharacters,
    );
    budget.remainingTextCharacters -= Math.min(
      transcript.length,
      maxCharacters,
    );
    return asTextAttachment(
      `${fileName} transcript`,
      transcript,
      maxCharacters,
    );
  }

  if (!buffer) return part;
  if (buffer.length > MAX_ATTACHMENT_BYTES_TO_PARSE) {
    return {
      type: "text",
      text: `[Attached file: ${fileName} is larger than the model context upload limit and could not be read inline.]`,
    };
  }

  if (extension && PARSABLE_EXTENSIONS.has(extension)) {
    try {
      const parsed = await parseBuffer(buffer, extension);
      if (parsed.content.trim()) {
        const maxCharacters = Math.min(
          MAX_ATTACHMENT_CONTEXT_CHARACTERS,
          budget.remainingTextCharacters,
        );
        if (maxCharacters <= 0) {
          return {
            type: "text",
            text: `[Attached file: ${fileName} was omitted because the attachment context budget is full.]`,
          };
        }
        budget.remainingTextCharacters -= Math.min(
          parsed.content.length,
          maxCharacters,
        );
        return asTextAttachment(fileName, parsed.content, maxCharacters);
      }
    } catch {
      // Preserve the file as a data URL when a parser is unavailable or fails.
    }
  }

  if (
    mediaType.startsWith("text/") ||
    (extension && TEXT_EXTENSIONS.has(extension))
  ) {
    const maxCharacters = Math.min(
      MAX_ATTACHMENT_CONTEXT_CHARACTERS,
      budget.remainingTextCharacters,
    );
    if (maxCharacters <= 0) {
      return {
        type: "text",
        text: `[Attached file: ${fileName} was omitted because the attachment context budget is full.]`,
      };
    }
    const content = buffer.toString("utf8");
    budget.remainingTextCharacters -= Math.min(content.length, maxCharacters);
    return asTextAttachment(fileName, content, maxCharacters);
  }

  if (mediaType.startsWith("image/")) {
    if (
      budget.inlineImageCount >= MAX_INLINE_IMAGES ||
      budget.remainingInlineBytes < buffer.length
    ) {
      return {
        type: "text",
        text: `[Attached image: ${fileName} was omitted because the visual context budget is full.]`,
      };
    }
    budget.inlineImageCount += 1;
  }

  if (buffer.length > budget.remainingInlineBytes) {
    return part;
  }

  budget.remainingInlineBytes -= buffer.length;
  return {
    ...part,
    url: toDataUrl(mediaType, buffer),
  };
}

/**
 * Convert browser/storage attachment references into model-readable content.
 * Text and supported office/document formats become bounded text context;
 * images and other binary files remain file parts backed by data URLs.
 */
export async function normalizeAttachmentContext(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const budget: AttachmentContextBudget = {
    remainingTextCharacters: MAX_TOTAL_ATTACHMENT_CONTEXT_CHARACTERS,
    remainingInlineBytes: MAX_INLINE_BINARY_BYTES,
    inlineImageCount: 0,
  };
  const normalizedMessages: ChatMessage[] = [];

  for (const message of messages) {
    const parts = (message.parts ?? []) as unknown as MessagePart[];
    const normalizedParts: MessagePart[] = [];
    for (const part of parts) {
      normalizedParts.push(
        part.type === "file" ? await normalizeFilePart(part, budget) : part,
      );
    }
    normalizedMessages.push({
      ...message,
      parts: normalizedParts as unknown as ChatMessage["parts"],
    });
  }

  return normalizedMessages;
}
