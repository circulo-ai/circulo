export function exponentialBackoff(
  attempt: number,
  base = 1000,
  max = 60000,
): number {
  return Math.min(base * Math.pow(2, attempt), max);
}
