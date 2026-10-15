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
    .replace(/[\uD800-\uDFFF]/gu, "");
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
    /[\uD800-\uDFFF]/u.test(text)
  );
}

/** Bound expanded JSON metadata, including YAML aliases, before database serialization. */
export function validateStructuredData(value: unknown) {
  const ancestors = new WeakSet<object>();
  const stack = [{ value, depth: 0, exit: false }];
  let nodes = 0;
  let characters = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.exit && entry.value && typeof entry.value === "object") {
      ancestors.delete(entry.value);
      continue;
    }
    if (++nodes > 100000 || entry.depth > 100)
      throw new Error(
        "Structured document is too complex; split or flatten it",
      );
    if (typeof entry.value === "string") characters += entry.value.length;
    if (characters > 2000000)
      throw new Error(
        "Expanded document metadata is too large; flatten aliases or split it",
      );
    if (entry.value && typeof entry.value === "object") {
      if (ancestors.has(entry.value))
        throw new Error(
          "Cyclic document aliases cannot be stored; flatten them first",
        );
      ancestors.add(entry.value);
      stack.push({ ...entry, exit: true });
      for (const child of Object.values(entry.value))
        stack.push({ value: child, depth: entry.depth + 1, exit: false });
    }
  }
}
