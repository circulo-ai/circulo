let counter = 0;

export function generateId(prefix: string): string {
  if (!prefix.trim()) {
    throw new Error("ID prefix must not be empty");
  }

  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${Date.now()}_${++counter}_${random ?? Math.random().toString(36).slice(2, 14)}`;
}
