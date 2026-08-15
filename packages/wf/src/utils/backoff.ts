export function exponentialBackoff(
  attempt: number,
  base = 1000,
  max = 60000,
): number {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new RangeError("Backoff attempt must be a non-negative integer");
  }
  if (!Number.isFinite(base) || base < 0) {
    throw new RangeError("Backoff base must be a finite, non-negative number");
  }
  if (!Number.isFinite(max) || max < base) {
    throw new RangeError("Backoff max must be finite and at least the base");
  }

  return Math.min(base * 2 ** attempt, max);
}
