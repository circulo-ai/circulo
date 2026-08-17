import { describe, expect, it } from "vitest";
import {
  calculateNextRun,
  validateSchedule,
  validateTimezone,
} from "./scheduling";

describe("scheduling", () => {
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
    ).toThrow("between 0 and 59");
  });
});
