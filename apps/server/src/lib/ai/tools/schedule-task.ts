import { db, scheduledTask } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { calculateNextRun, validateSchedule } from "@/services/scheduling";
import { tool, type Tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000),
  scheduleType: z.enum(["once", "interval", "cron"]),
  schedule: z.string().trim().min(1),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
});

export function scheduleTask(params: {
  session: ActorContext;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
  return tool({
    description:
      "Create a one-time or recurring scheduled task for the current chat. Use this when the user asks for a reminder, recurring briefing, monitoring check, or other proactive work.",
    inputSchema,
    execute: async (input) => {
      if (!params.session.organizationId)
        throw new Error("An organization is required for scheduled tasks");
      const chat = await chatRepo.findById(params.chatId);
      if (
        !chat ||
        chat.organizationId !== params.session.organizationId ||
        !(await chatMemberRepo.isMember(params.session.userId, params.chatId))
      ) {
        throw new Error("You must be an active member of this chat");
      }
      validateSchedule(input);
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
          nextRunAt: calculateNextRun(input, new Date()),
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
