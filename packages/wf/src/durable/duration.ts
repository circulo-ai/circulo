/** A duration expressed in milliseconds or a human-readable string. */
export type DurationInput = number | string;

const UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sec: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

const COMPONENT = /(\d+(?:\.\d+)?|\.\d+)\s*([a-zA-Z]+)/gy;

/**
 * Parses a duration into integer milliseconds.
 *
 * Numbers are already milliseconds. Strings may contain multiple components,
 * for example `"1h 20m"` or `"30 days"`. Calendar-dependent units such as
 * months and years are intentionally not supported.
 */
export function parseDuration(value: DurationInput): number {
  if (typeof value === "number") {
    assertDuration(value);
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError("Duration must be a finite number or a non-empty string");
  }

  const source = value.trim();
  COMPONENT.lastIndex = 0;
  let cursor = 0;
  let total = 0;
  let matched = false;
  const seenUnits = new Set<number>();
  while (cursor < source.length) {
    if (matched) {
      if (!/\s/.test(source[cursor]!)) {
        throw new RangeError(`Invalid duration "${value}"`);
      }
      while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1;
      if (cursor >= source.length) break;
    }
    COMPONENT.lastIndex = cursor;
    const match = COMPONENT.exec(source);
    if (!match || match.index !== cursor) {
      throw new RangeError(`Invalid duration "${value}"`);
    }
    const amount = Number(match[1]);
    const unit = match[2]!.toLowerCase();
    const multiplier = UNITS[unit];
    if (multiplier === undefined || !Number.isFinite(amount) || amount < 0) {
      throw new RangeError(`Invalid duration "${value}"`);
    }
    if (seenUnits.has(multiplier)) {
      throw new RangeError(`Duration unit "${unit}" may only be used once`);
    }
    seenUnits.add(multiplier);
    total += amount * multiplier;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(`Duration "${value}" exceeds the safe integer limit`);
    }
    matched = true;
    cursor = COMPONENT.lastIndex;
  }

  if (!matched) throw new RangeError(`Invalid duration "${value}"`);
  assertDuration(total);
  return total;
}

/** Formats milliseconds into a compact, stable duration string. */
export function formatDuration(milliseconds: number): string {
  assertDuration(milliseconds);
  if (milliseconds === 0) return "0ms";

  let remaining = milliseconds;
  const parts: string[] = [];
  const units: readonly [string, number][] = [
    ["w", 604_800_000],
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1_000],
    ["ms", 1],
  ];
  for (const [suffix, size] of units) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount}${suffix}`);
      remaining -= amount * size;
    }
  }
  return parts.join(" ");
}

export function assertDuration(value: number): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new RangeError("Duration must be a finite, non-negative safe integer in milliseconds");
  }
}
