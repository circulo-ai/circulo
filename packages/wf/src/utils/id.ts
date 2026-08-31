export function generateId(prefix: string): string {
  if (!prefix.trim()) {
    throw new Error("ID prefix must not be empty");
  }

  const random = globalThis.crypto?.randomUUID?.();
  if (!random) {
    throw new Error(
      "A secure Web Crypto randomUUID implementation is required to generate workflow identifiers",
    );
  }
  return `${prefix}_${random}`;
}
