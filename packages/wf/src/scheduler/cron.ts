interface CronFields {
  seconds: Set<number>;
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  dayOfMonthWildcard: boolean;
  dayOfWeekWildcard: boolean;
}

/** Calculates the next UTC occurrence for standard 5-field or 6-field cron expressions. */
export function nextCronOccurrence(expression: string, after: number | Date): number {
  const fields = parseCron(expression);
  const start = after instanceof Date ? after.getTime() : after;
  const hasSeconds = expression.trim().split(/\s+/u).length === 6;
  const step = hasSeconds ? 1000 : 60_000;
  const candidate = new Date(start + (hasSeconds ? 1000 : 60_000));
  if (!hasSeconds) candidate.setUTCSeconds(0, 0);
  else candidate.setUTCMilliseconds(0);

  const maxIterations = hasSeconds ? 31_622_400 : 527_040;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (matchesCron(fields, candidate, hasSeconds)) return candidate.getTime();
    candidate.setTime(candidate.getTime() + step);
  }
  throw new RangeError(`Cron expression has no occurrence within the supported search window: ${expression}`);
}

function parseCron(expression: string): CronFields {
  const tokens = expression.trim().split(/\s+/u);
  if (tokens.length !== 5 && tokens.length !== 6) {
    throw new RangeError("Cron expressions must have 5 or 6 fields");
  }
  const offset = tokens.length === 6 ? 1 : 0;
  return {
    seconds: parseField(tokens.length === 6 ? tokens[0] ?? "0" : "0", 0, 59),
    minutes: parseField(tokens[offset] ?? "*", 0, 59),
    hours: parseField(tokens[offset + 1] ?? "*", 0, 23),
    daysOfMonth: parseField(tokens[offset + 2] ?? "*", 1, 31),
    months: parseField(tokens[offset + 3] ?? "*", 1, 12),
    daysOfWeek: parseField(tokens[offset + 4] ?? "*", 0, 7, true),
    dayOfMonthWildcard: (tokens[offset + 2] ?? "*") === "*",
    dayOfWeekWildcard: (tokens[offset + 4] ?? "*") === "*",
  };
}

function parseField(value: string, min: number, max: number, sundayAlias = false): Set<number> {
  const result = new Set<number>();
  for (const part of value.split(",")) {
    const [rangeValue, stepValue] = part.split("/");
    const step = stepValue === undefined ? 1 : parsePositiveInteger(stepValue, "cron step");
    const [startValue, endValue] = (rangeValue ?? "").split("-");
    const start = startValue === "*" || startValue === "" || startValue === undefined ? min : parseInteger(startValue, min, max);
    const end = endValue === undefined ? (startValue === "*" || startValue === "" ? max : start) : parseInteger(endValue, min, max);
    if (end < start) throw new RangeError(`Invalid cron range: ${part}`);
    for (let item = start; item <= end; item += step) {
      result.add(sundayAlias && item === 7 ? 0 : item);
    }
  }
  if (result.size === 0) throw new RangeError(`Cron field is empty: ${value}`);
  return result;
}

function parseInteger(value: string, min: number, max: number): number {
  if (!/^\d+$/u.test(value)) throw new RangeError(`Invalid cron value: ${value}`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new RangeError(`Cron value ${value} is outside ${min}-${max}`);
  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/u.test(value) || Number(value) < 1) throw new RangeError(`${label} must be positive`);
  return Number(value);
}

function matchesCron(fields: CronFields, date: Date, hasSeconds: boolean): boolean {
  if (hasSeconds && !fields.seconds.has(date.getUTCSeconds())) return false;
  if (!fields.minutes.has(date.getUTCMinutes()) || !fields.hours.has(date.getUTCHours())) return false;
  if (!fields.months.has(date.getUTCMonth() + 1)) return false;
  const dayOfMonthMatches = fields.daysOfMonth.has(date.getUTCDate());
  const dayOfWeekMatches = fields.daysOfWeek.has(date.getUTCDay());
  const dayMatches = fields.dayOfMonthWildcard || fields.dayOfWeekWildcard
    ? dayOfMonthMatches && dayOfWeekMatches
    : dayOfMonthMatches || dayOfWeekMatches;
  return dayMatches;
}
