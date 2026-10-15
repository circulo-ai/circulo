import { CronExpressionParser } from "cron-parser";

export type ScheduleType = "once" | "interval" | "cron";
export type ScheduleDefinition = {
  scheduleType: ScheduleType;
  schedule: string;
  timezone: string;
};

export function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
}

function parseCron(schedule: string, timezone: string, now: Date) {
  if (schedule.trim().split(/\s+/).length !== 5)
    throw new Error("Cron schedules must contain exactly five fields");
  try {
    return CronExpressionParser.parse(schedule, {
      currentDate: now,
      tz: timezone,
    });
  } catch (error) {
    throw new Error(
      `Invalid cron schedule: ${error instanceof Error ? error.message : "unable to parse"}`,
    );
  }
}

export function validateSchedule(
  definition: ScheduleDefinition,
  now = new Date(),
): void {
  validateTimezone(definition.timezone);
  if (definition.scheduleType === "once") {
    const date = new Date(definition.schedule);
    if (
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(definition.schedule) ||
      Number.isNaN(date.getTime()) ||
      date <= now
    )
      throw new Error(
        "The one-time schedule must be a future ISO date with a timezone offset",
      );
  } else if (definition.scheduleType === "interval") {
    const seconds = Number(definition.schedule);
    if (
      !/^\d+$/.test(definition.schedule) ||
      !Number.isSafeInteger(seconds) ||
      seconds < 10 ||
      seconds > 31_536_000
    )
      throw new Error(
        "Intervals must be at least 10 seconds and no more than one year",
      );
  } else {
    parseCron(definition.schedule, definition.timezone, now).next();
  }
}

/** First due date, distinct from a consumed one-time run's terminal state. */
export function firstRunAt(
  definition: ScheduleDefinition,
  now = new Date(),
): Date {
  validateSchedule(definition, now);
  return definition.scheduleType === "once"
    ? new Date(definition.schedule)
    : calculateNextRun(definition, now)!;
}

export function calculateNextRun(
  definition: ScheduleDefinition,
  now: Date,
): Date | null {
  validateTimezone(definition.timezone);
  if (definition.scheduleType === "once") {
    if (Number.isNaN(new Date(definition.schedule).getTime()))
      throw new Error("The one-time schedule must be a valid ISO date");
    return null;
  }
  if (definition.scheduleType === "interval") {
    validateSchedule(definition, now);
    return new Date(now.getTime() + Number(definition.schedule) * 1000);
  }
  return parseCron(definition.schedule, definition.timezone, now)
    .next()
    .toDate();
}
