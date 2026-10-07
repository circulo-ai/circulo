/** Return a URL that is safe to use as a navigable link or preview source. */
export function getSafeNavigationUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Web previews must load network documents, never executable URL schemes. */
export function getSafePreviewUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
