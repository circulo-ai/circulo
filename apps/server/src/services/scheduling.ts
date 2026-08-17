export type ScheduleType = "once" | "interval" | "cron";

export type ScheduleDefinition = {
  scheduleType: ScheduleType;
  schedule: string;
  timezone: string;
};

type CronField = {
  values: Set<number>;
  isFull: boolean;
};

type CronExpression = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

const WEEKDAYS = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

export function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
}

export function validateSchedule(
  definition: ScheduleDefinition,
  now = new Date(),
): void {
  validateTimezone(definition.timezone);

  if (definition.scheduleType === "once") {
    const date = new Date(definition.schedule);
    if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) {
      throw new Error("The one-time schedule must be a future ISO date");
    }
    return;
  }

  if (definition.scheduleType === "interval") {
    const seconds = Number(definition.schedule);
    if (!Number.isInteger(seconds) || seconds < 10) {
      throw new Error("Intervals must be at least 10 seconds");
    }
    return;
  }

  parseCron(definition.schedule);
}

export function calculateNextRun(
  definition: ScheduleDefinition,
  now: Date,
): Date | null {
  // A one-time schedule is validated as future-facing when it is created or
  // edited. Once it is due, the scheduler must still be able to calculate its
  // terminal state instead of rejecting the already-consumed timestamp.
  if (definition.scheduleType === "once") {
    validateTimezone(definition.timezone);
    const date = new Date(definition.schedule);
    if (Number.isNaN(date.getTime())) {
      throw new Error("The one-time schedule must be a valid ISO date");
    }
    return null;
  }

  validateSchedule(definition, now);

  if (definition.scheduleType === "interval") {
    return new Date(now.getTime() + Number(definition.schedule) * 1000);
  }

  const cron = parseCron(definition.schedule);
  const candidate = new Date(now.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Iterate over real UTC minutes so DST transitions are handled by the
  // runtime's timezone conversion. Eight years covers the longest practical
  // five-field cron gap (including February 29 schedules) without allowing an
  // invalid expression to loop forever.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: definition.timezone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const maximumLookahead = 8 * 366 * 24 * 60;

  for (let index = 0; index < maximumLookahead; index += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(candidate)
        .filter(({ type }) =>
          ["weekday", "year", "month", "day", "hour", "minute"].includes(type),
        )
        .map(({ type, value }) => [type, value]),
    );
    const weekday = WEEKDAYS.get(parts.weekday ?? "");
    const local = {
      minute: Number(parts.minute),
      hour: Number(parts.hour),
      dayOfMonth: Number(parts.day),
      month: Number(parts.month),
      dayOfWeek: weekday ?? -1,
    };

    if (
      cron.minute.values.has(local.minute) &&
      cron.hour.values.has(local.hour) &&
      cron.month.values.has(local.month) &&
      matchesCronDay(cron.dayOfMonth, cron.dayOfWeek, local)
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error("Unable to calculate the next cron run within eight years");
}

function parseCron(schedule: string): CronExpression {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("Cron schedules must contain exactly five fields");
  }

  return {
    minute: parseCronField(fields[0]!, 0, 59, "minute"),
    hour: parseCronField(fields[1]!, 0, 23, "hour"),
    dayOfMonth: parseCronField(fields[2]!, 1, 31, "day of month"),
    month: parseCronField(fields[3]!, 1, 12, "month"),
    dayOfWeek: parseCronField(fields[4]!, 0, 7, "day of week", (value) =>
      value === 7 ? 0 : value,
    ),
  };
}

function parseCronField(
  raw: string,
  minimum: number,
  maximum: number,
  name: string,
  normalize: (value: number) => number = (value) => value,
): CronField {
  if (!raw) throw new Error(`Cron ${name} field cannot be empty`);

  const values = new Set<number>();
  for (const item of raw.split(",")) {
    const segments = item.split("/");
    if (segments.length > 2) {
      throw new Error(`Cron ${name} field has too many step separators`);
    }
    const [rangePart, stepPart] = segments;
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Cron ${name} step must be a positive integer`);
    }

    let start: number;
    let end: number;
    if (rangePart === "*") {
      start = minimum;
      end = maximum;
    } else if (/^\d+$/.test(rangePart ?? "")) {
      start = Number(rangePart);
      end = stepPart === undefined ? start : maximum;
    } else if (/^\d+-\d+$/.test(rangePart ?? "")) {
      const [rangeStart, rangeEnd] = rangePart!.split("-").map(Number);
      start = rangeStart!;
      end = rangeEnd!;
      if (start > end) {
        throw new Error(`Cron ${name} ranges must be ascending`);
      }
    } else {
      throw new Error(`Invalid cron ${name} field`);
    }

    if (start < minimum || start > maximum || end < minimum || end > maximum) {
      throw new Error(
        `Cron ${name} values must be between ${minimum} and ${maximum}`,
      );
    }

    for (let value = start; value <= end; value += step) {
      values.add(normalize(value));
    }
  }

  const expectedSize =
    normalize(maximum) === normalize(minimum)
      ? maximum - minimum
      : maximum - minimum + 1;
  return { values, isFull: values.size === expectedSize };
}

function matchesCronDay(
  dayOfMonth: CronField,
  dayOfWeek: CronField,
  local: { dayOfMonth: number; dayOfWeek: number },
): boolean {
  const monthDayMatches = dayOfMonth.values.has(local.dayOfMonth);
  const weekDayMatches = dayOfWeek.values.has(local.dayOfWeek);

  // POSIX cron uses OR semantics when both day fields are restricted, while
  // a wildcard in either field leaves the other field authoritative.
  if (dayOfMonth.isFull && dayOfWeek.isFull) return true;
  if (dayOfMonth.isFull) return weekDayMatches;
  if (dayOfWeek.isFull) return monthDayMatches;
  return monthDayMatches || weekDayMatches;
}
