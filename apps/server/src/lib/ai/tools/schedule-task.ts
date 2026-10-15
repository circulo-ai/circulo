import { db, scheduledTask } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { hasPermissionForUser } from "@/lib/permissions";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { firstRunAt } from "@/services/scheduling";
import { tool, type Tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000),
  scheduleType: z.enum(["once", "interval", "cron"]),
  schedule: z.string().trim().min(1),
  timezone: z.string().trim().min(1).max(100),
});

export function scheduleTask(params: {
  session: ActorContext;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
  return tool({
    description: `Create a one-time or recurring scheduled task for the current chat. Use this when the user asks for a reminder, recurring briefing, monitoring check, or other proactive work. Current UTC timestamp: ${new Date().toISOString()}. User/device time zone: ${params.session.timeZone ?? "unknown; ask before interpreting a local wall-clock time"}. Use the user's requested zone or this device zone; never silently assume UTC for a local-time request.`,
    inputSchema,
    execute: async (input) => {
      if (!params.session.organizationId)
        throw new Error("An organization is required for scheduled tasks");
      if (
        !(await hasPermissionForUser(
          params.session.userId,
          params.session.organizationId,
          "automation",
          "create",
          params.session.apiKeyPermissions,
        )) &&
        !(await hasPermissionForUser(
          params.session.userId,
          params.session.organizationId,
          "automation",
          "manage",
          params.session.apiKeyPermissions,
        ))
      )
        throw new Error(
          "Your workspace role or API key does not allow creating scheduled tasks.",
        );
      const chat = await chatRepo.findById(params.chatId);
      if (
        !chat ||
        chat.organizationId !== params.session.organizationId ||
        !(await chatMemberRepo.isMember(params.session.userId, params.chatId))
      ) {
        throw new Error("You must be an active member of this chat");
      }
      const nextRunAt = firstRunAt(input);
      const [created] = (await db
        .insert(scheduledTask)
        .values({
          organizationId: params.session.organizationId,
          chatId: params.chatId,
          createdBy: params.session.userId,
          name: input.name,
          prompt: input.prompt,
          scheduleType: input.scheduleType,
          schedule: input.schedule,
          timezone: input.timezone,
          nextRunAt,
          metadata: {
            _execution: {
              apiKeyPermissions: params.session.apiKeyPermissions ?? null,
              apiKeyId: params.session.apiKeyId ?? null,
            },
          },
        })
        .returning()) as [typeof scheduledTask.$inferSelect | undefined];
      if (!created) throw new Error("Unable to create scheduled task");
      params.dataStream.write({
        type: "data-scheduledTaskCreated",
        data: {
          id: created.id,
          name: created.name,
          nextRunAt: created.nextRunAt?.toISOString() ?? null,
        },
        transient: false,
      });
      return {
        taskId: created.id,
        status: created.status,
        nextRunAt: created.nextRunAt,
        message:
          "Scheduled task created. The associated chat will be used when it runs.",
      };
    },
  });
}
