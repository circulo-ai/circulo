import { db, taskHandoff } from "@/db";
import { chatAgentRepo, chatMemberRepo } from "@/db/repositories";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { tool, type Tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";

export function handoffTask(params: {
  session: ActorContext;
  chatId: string;
  workflowRunId: string;
  fromAgentId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
  return tool({
    description:
      "Hand off a focused task to another agent or human teammate in this chat.",
    inputSchema: z
      .object({
        toAgentId: z.string().uuid().optional(),
        toUserId: z.string().optional(),
        task: z.string().min(1).max(20000),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .refine(
        (input) => Boolean(input.toAgentId) !== Boolean(input.toUserId),
        "Choose exactly one target agent or user",
      ),
    execute: async (input) => {
      if (!params.session.organizationId)
        throw new Error("An organization is required for task handoff");
      if (
        input.toUserId &&
        !(await chatMemberRepo.isMember(input.toUserId, params.chatId))
      ) {
        throw new Error(
          "The target user must be an active member of this chat",
        );
      }
      if (input.toAgentId) {
        if (input.toAgentId === params.fromAgentId) {
          throw new Error("An agent cannot hand off a task to itself");
        }
        const target = await chatAgentRepo.findAgentInChat(
          input.toAgentId,
          params.chatId,
        );
        if (!target || !target.isEnabled)
          throw new Error("The target agent must be enabled in this chat");
      }
      const [handoff] = await db
        .insert(taskHandoff)
        .values({
          organizationId: params.session.organizationId,
          chatId: params.chatId,
          fromAgentId: params.fromAgentId,
          toAgentId: input.toAgentId,
          toUserId: input.toUserId,
          createdBy: params.session.userId,
          task: input.task,
          context: {
            ...(input.context ?? {}),
            workflowRunId: params.workflowRunId,
          },
        })
        .returning();
      if (!handoff) throw new Error("Unable to create task handoff");
      params.dataStream.write({
        type: "data-workflowHandoffCreated",
        data: { id: handoff.id, task: handoff.task, status: handoff.status },
        transient: false,
      });
      return {
        handoffId: handoff.id,
        status: handoff.status,
        message: "Task handoff created.",
      };
    },
  });
}
