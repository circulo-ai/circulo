/**
 * Message URLs are user/model-controlled data. Keep local application paths
 * and ordinary web URLs, but never persist executable or local-machine schemes.
 */
export function isSafeMessageUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const protocol = new URL(value).protocol;
    return (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "data:" ||
      protocol === "blob:"
    );
  } catch {
    return false;
  }
}
