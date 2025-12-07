let counter = 0;

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++counter}_${Math.random().toString(36).slice(2, 9)}`;
}
