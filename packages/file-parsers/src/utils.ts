/**
 * Utility functions for file parsing
 */

/**
 * Clean text content to ensure it's safe for UTF-8 storage in databases.
 */
export function sanitizeTextForUTF8(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

/**
 * Sanitize an array of strings
 */
export function sanitizeTextArray(texts: string[]): string[] {
  return texts.map((text) => sanitizeTextForUTF8(text));
}

/**
 * Check if a string contains problematic characters for UTF-8 storage
 */
export function hasInvalidUTF8Characters(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }

  return (
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text) ||
    /\uFFFD/.test(text) ||
    /[\uD800-\uDFFF]/.test(text)
  );
}
