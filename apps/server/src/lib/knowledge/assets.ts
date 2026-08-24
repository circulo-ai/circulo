const IMAGE_MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

const MAX_INLINE_KNOWLEDGE_IMAGE_BYTES = 4 * 1024 * 1024;

export function getKnowledgeImageContentType(
  fileName: string,
  _contentType?: string | null,
): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !(extension in IMAGE_MIME_BY_EXTENSION)) return null;

  const expected =
    IMAGE_MIME_BY_EXTENSION[extension as keyof typeof IMAGE_MIME_BY_EXTENSION];
  return expected;
}

export function getKnowledgeAssetKey(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const key = metadata?.assetKey;
  return typeof key === "string" && key.trim() ? key : null;
}

export function isKnowledgeImageDocument(document: {
  contentType: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  return (
    document.contentType.startsWith("image/") &&
    Boolean(getKnowledgeAssetKey(document.metadata))
  );
}

export function toKnowledgeImageDataUrl(
  buffer: Buffer,
  contentType: string,
): string | null {
  if (buffer.length > MAX_INLINE_KNOWLEDGE_IMAGE_BYTES) return null;
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export function getKnowledgeImageInlineLimit(): number {
  return MAX_INLINE_KNOWLEDGE_IMAGE_BYTES;
}

export function hasKnowledgeImageSignature(
  buffer: Buffer,
  contentType: string,
): boolean {
  if (contentType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (contentType === "image/png") {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/gif") {
    return buffer.subarray(0, 4).toString("ascii") === "GIF8";
  }
  if (contentType === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}
