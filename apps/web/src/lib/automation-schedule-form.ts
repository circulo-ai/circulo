import { z } from "zod";

export type Repeat =
  | "once"
  | "daily"
  | "weekdays"
  | "weekly"
  | "interval"
  | "cron";
export type TaskForm = {
  chatId: string;
  name: string;
  prompt: string;
  repeat: Repeat;
  schedule: string;
  at: string;
  dayOfWeek: string;
  intervalSeconds: string;
  timezone: string;
};

export const taskSchema = z
  .object({
    chatId: z
      .string()
      .trim()
      .min(1, "Choose the chat this task should post into."),
    name: z
      .string()
      .trim()
      .min(1, "Add a title for this scheduled task.")
      .max(200),
    prompt: z
      .string()
      .trim()
      .min(1, "Describe what the task should do.")
      .max(20_000),
    repeat: z.enum(["once", "daily", "weekdays", "weekly", "interval", "cron"]),
    schedule: z.string().trim(),
    at: z.string(),
    dayOfWeek: z.string(),
    intervalSeconds: z.string(),
    timezone: z
      .string()
      .trim()
      .min(1, "Add an IANA time zone, such as Asia/Tehran."),
  })
  .superRefine((form, ctx) => {
    if (
      (form.repeat === "once" || form.repeat === "cron") &&
      !form.schedule.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["schedule"],
        message: "Choose when this task should run.",
      });
    }
  });

export function scheduleFor(form: TaskForm) {
  if (form.repeat === "once")
    return {
      scheduleType: "once" as const,
      schedule: new Date(form.schedule).toISOString(),
    };
  if (form.repeat === "interval")
    return {
      scheduleType: "interval" as const,
      schedule: form.intervalSeconds,
    };
  if (form.repeat === "cron")
    return { scheduleType: "cron" as const, schedule: form.schedule };
  const [hour, minute] = form.at.split(":").map(Number);
  const day =
    form.repeat === "daily"
      ? "*"
      : form.repeat === "weekly"
        ? form.dayOfWeek
        : "1-5";
  return {
    scheduleType: "cron" as const,
    schedule: `${minute} ${hour} * * ${day}`,
  };
}
