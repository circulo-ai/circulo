import { describe, expect, it } from "vitest";
import {
  calculateNextRun,
  firstRunAt,
  validateSchedule,
  validateTimezone,
} from "./scheduling";

describe("scheduling", () => {
  it("gives one-time tasks a future first due date", () => {
    expect(
      firstRunAt(
        {
          scheduleType: "once",
          schedule: "2026-08-17T14:00:00+03:30",
          timezone: "Asia/Tehran",
        },
        new Date("2026-08-17T10:00:00Z"),
      ),
    ).toEqual(new Date("2026-08-17T10:30:00Z"));
  });
  it("rejects naive dates, impossible cron dates and unbounded intervals", () => {
    expect(() =>
      validateSchedule({
        scheduleType: "once",
        schedule: "2026-12-01T10:00:00",
        timezone: "UTC",
      }),
    ).toThrow("timezone offset");
    expect(() =>
      firstRunAt({
        scheduleType: "cron",
        schedule: "0 0 31 2 *",
        timezone: "UTC",
      }),
    ).toThrow();
    expect(() =>
      validateSchedule({
        scheduleType: "interval",
        schedule: "9007199254740991",
        timezone: "UTC",
      }),
    ).toThrow("one year");
  });
  it("handles timezone offsets and daylight-saving gaps", () => {
    expect(
      firstRunAt(
        {
          scheduleType: "cron",
          schedule: "0 9 * * *",
          timezone: "Asia/Tehran",
        },
        new Date("2026-08-17T00:00:00Z"),
      ),
    ).toEqual(new Date("2026-08-17T05:30:00Z"));
    expect(
      firstRunAt(
        {
          scheduleType: "cron",
          schedule: "30 2 * * *",
          timezone: "America/New_York",
        },
        new Date("2026-03-08T00:00:00Z"),
      ),
    ).toEqual(new Date("2026-03-08T07:30:00Z"));
  });
  it("calculates interval schedules from the current time", () => {
    const now = new Date("2026-08-17T10:00:00.000Z");
    expect(
      calculateNextRun(
        { scheduleType: "interval", schedule: "60", timezone: "UTC" },
        now,
      ),
    ).toEqual(new Date("2026-08-17T10:01:00.000Z"));
  });

  it("finishes a due one-time schedule instead of rejecting its past timestamp", () => {
    expect(
      calculateNextRun(
        {
          scheduleType: "once",
          schedule: "2026-08-17T10:00:00.000Z",
          timezone: "UTC",
        },
        new Date("2026-08-17T10:01:00.000Z"),
      ),
    ).toBeNull();
  });

  it("aligns cron schedules to minute boundaries in the requested timezone", () => {
    const now = new Date("2026-08-17T10:07:32.000Z");
    expect(
      calculateNextRun(
        { scheduleType: "cron", schedule: "*/15 * * * *", timezone: "UTC" },
        now,
      ),
    ).toEqual(new Date("2026-08-17T10:15:00.000Z"));
  });

  it("supports standard five-field cron schedules", () => {
    const now = new Date("2026-08-17T10:07:32.000Z");
    expect(
      calculateNextRun(
        { scheduleType: "cron", schedule: "30 9 * * 1-5", timezone: "UTC" },
        now,
      ),
    ).toEqual(new Date("2026-08-18T09:30:00.000Z"));
  });

  it("rejects invalid timezones and malformed schedules", () => {
    expect(() => validateTimezone("Not/A_Timezone")).toThrow("IANA timezone");
    expect(() =>
      validateSchedule({
        scheduleType: "cron",
        schedule: "0 * * * * *",
        timezone: "UTC",
      }),
    ).toThrow("Cron");
    expect(() =>
      validateSchedule({
        scheduleType: "cron",
        schedule: "61 * * * *",
        timezone: "UTC",
      }),
    ).toThrow("cron schedule");
  });
});
