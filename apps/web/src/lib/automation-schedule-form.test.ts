import { describe, expect, it } from "vitest";
import {
  scheduleFor,
  taskSchema,
  type TaskForm,
} from "./automation-schedule-form";

const form: TaskForm = {
  chatId: "chat",
  name: "Local task",
  prompt: "Verify fixture",
  repeat: "daily",
  schedule: "",
  at: "09:30",
  dayOfWeek: "5",
  intervalSeconds: "60",
  timezone: "Asia/Tehran",
};
describe("schedule editor values", () => {
  it.each(["daily", "weekdays", "weekly", "interval"] as const)(
    "does not require a hidden cron field for %s",
    (repeat) => {
      expect(taskSchema.safeParse({ ...form, repeat }).success).toBe(true);
    },
  );
  it("requires the visible date or cron expression", () => {
    for (const repeat of ["once", "cron"])
      expect(taskSchema.safeParse({ ...form, repeat }).success).toBe(false);
  });
  it("uses the selected frequency and preserves an explicit date offset", () => {
    expect(scheduleFor(form)).toEqual({
      scheduleType: "cron",
      schedule: "30 9 * * *",
    });
    expect(scheduleFor({ ...form, repeat: "interval" })).toEqual({
      scheduleType: "interval",
      schedule: "60",
    });
    expect(
      scheduleFor({
        ...form,
        repeat: "once",
        schedule: "2030-10-15T09:30:00+03:30",
      }),
    ).toEqual({ scheduleType: "once", schedule: "2030-10-15T06:00:00.000Z" });
  });
});
