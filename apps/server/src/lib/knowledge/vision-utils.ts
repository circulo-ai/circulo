export type VisionMessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | null
  | undefined;

export function extractVisionText(
  content: VisionMessageContent,
): string | null {
  const text = Array.isArray(content)
    ? content
        .map((part) => (part?.type === "text" ? (part.text ?? "") : ""))
        .filter(Boolean)
        .join("\n")
    : typeof content === "string"
      ? content
      : "";
  const normalized = text.trim();
  return normalized ? normalized.slice(0, 20_000) : null;
}

export function buildImageKnowledgeContent(
  fileName: string,
  visionText: string,
): string {
  return `Image attachment: ${fileName}\n\nVisual extraction:\n${visionText}`;
}
