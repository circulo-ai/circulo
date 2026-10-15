import { db, scheduledTask } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { hasPermissionForUser } from "@/lib/permissions";
import type { ActorContext } from "@/lib/types";
import { executionMetadata } from "@/services/scheduled-dispatch";
import { firstRunAt } from "@/services/scheduling";
import { tool, type Tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

export function manageScheduledTasks(params: {
  session: ActorContext;
  chatId: string;
}): Tool {
  return tool({
    description:
      "List, edit, pause or resume scheduled tasks in the current chat. Use scheduleTask to create a new task. Never infer permission to reschedule or change a prompt from a task's existence.",
    inputSchema: z.object({
      action: z.enum(["list", "update", "pause", "resume"]),
      taskId: z.uuid().nullable(),
      name: z.string().trim().min(1).max(200).nullable(),
      prompt: z.string().trim().min(1).max(20_000).nullable(),
      scheduleType: z.enum(["once", "interval", "cron"]).nullable(),
      schedule: z.string().trim().min(1).nullable(),
      timezone: z.string().trim().min(1).max(100).nullable(),
    }),
    execute: async (input) => {
      const { userId, organizationId, apiKeyPermissions } = params.session;
      if (!organizationId) throw new Error("An active workspace is required.");
      const chat = await chatRepo.findById(params.chatId);
      if (
        !chat ||
        chat.isDeleted ||
        chat.organizationId !== organizationId ||
        !(await chatMemberRepo.isMember(userId, params.chatId))
      )
        throw new Error("You no longer have access to this chat.");
      const manager = await hasPermissionForUser(
        userId,
        organizationId,
        "automation",
        "manage",
        apiKeyPermissions,
      );
      const action = input.action === "list" ? "read" : "update";
      if (
        !manager &&
        !(await hasPermissionForUser(
          userId,
          organizationId,
          "automation",
          action,
          apiKeyPermissions,
        ))
      )
        throw new Error(
          `Your role or API key does not allow automation ${action}.`,
        );
      const scope = and(
        eq(scheduledTask.organizationId, organizationId),
        eq(scheduledTask.chatId, params.chatId),
        ...(manager ? [] : [eq(scheduledTask.createdBy, userId)]),
      );
      if (input.action === "list")
        return {
          tasks: (
            await db.query.scheduledTask.findMany({
              where: scope,
              orderBy: desc(scheduledTask.createdAt),
              limit: 100,
              columns: {
                id: true,
                name: true,
                prompt: true,
                status: true,
                scheduleType: true,
                schedule: true,
                timezone: true,
                nextRunAt: true,
              },
            })
          ).map((task) => ({ ...task, prompt: task.prompt.slice(0, 1000) })),
        };
      if (!input.taskId)
        throw new Error("Choose a task ID returned by the task list.");
      const current = await db.query.scheduledTask.findFirst({
        where: and(scope, eq(scheduledTask.id, input.taskId)),
      });
      if (!current)
        throw new Error(
          "This scheduled task is not available in the current chat.",
        );
      const definition = {
        scheduleType: input.scheduleType ?? current.scheduleType,
        schedule: input.schedule ?? current.schedule,
        timezone: input.timezone ?? current.timezone,
      };
      const changed =
        input.action === "update" &&
        (input.scheduleType !== null ||
          input.schedule !== null ||
          input.timezone !== null);
      const status =
        input.action === "pause"
          ? "paused"
          : input.action === "resume" ||
              (changed && current.status !== "paused")
            ? "active"
            : current.status;
      const nextRunAt =
        changed ||
        (input.action === "resume" &&
          !executionMetadata(current.metadata).pending)
          ? firstRunAt(definition)
          : current.nextRunAt;
      const [updated] = await db
        .update(scheduledTask)
        .set({
          ...(input.action === "update"
            ? {
                name: input.name ?? current.name,
                prompt: input.prompt ?? current.prompt,
                ...definition,
              }
            : {}),
          status,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(and(scope, eq(scheduledTask.id, current.id)))
        .returning();
      if (!updated)
        throw new Error("The task was removed before the update completed.");
      return {
        taskId: updated.id,
        name: updated.name,
        status: updated.status,
        nextRunAt: updated.nextRunAt,
        timezone: updated.timezone,
      };
    },
  });
}
