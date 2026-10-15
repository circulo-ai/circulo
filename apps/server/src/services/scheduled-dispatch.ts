import { db, message, scheduledTask, workflowRun } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { currentAutomationPermissions } from "@/lib/automation-actor";
import { createLogger } from "@/lib/logs/console/logger";
import {
  hasPermissionForUser,
  type ApiKeyPermissions,
} from "@/lib/permissions";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { and, eq, sql } from "drizzle-orm";
import { calculateNextRun } from "./scheduling";
const logger = createLogger("ScheduledDispatch");

type PendingExecution = {
  messageId: string;
  chatId: string;
  prompt: string;
  dueAt: string;
};
type ExecutionMetadata = {
  apiKeyPermissions?: ApiKeyPermissions;
  apiKeyId?: string | null;
  pending?: PendingExecution;
  lastRunId?: string;
  lastOutcome?: string;
  lastError?: string;
};
export function executionMetadata(
  metadata: Record<string, unknown>,
): ExecutionMetadata {
  return (metadata._execution ?? {}) as ExecutionMetadata;
}

/** The due-date advancement, prompt message and dispatch intent commit together.
 * A stable message ID fences workflow creation on restart or competing workers. */
export async function dispatchScheduledTask(
  taskId: string,
  now = new Date(),
): Promise<void> {
  const initial = await db.query.scheduledTask.findFirst({
    where: eq(scheduledTask.id, taskId),
  });
  if (!initial || ["paused", "failed"].includes(initial.status)) return;
  const initialExecution = executionMetadata(initial.metadata);
  try {
    initialExecution.apiKeyPermissions = await currentAutomationPermissions({
      userId: initial.createdBy,
      ...initialExecution,
    });
  } catch (error) {
    await db
      .update(scheduledTask)
      .set({
        status: "paused",
        metadata: sql`jsonb_set(${scheduledTask.metadata}, '{pausedReason}', ${JSON.stringify(error instanceof Error ? error.message : "The originating credential is unavailable.")}::jsonb)`,
        updatedAt: now,
      })
      .where(eq(scheduledTask.id, taskId));
    return;
  }
  const authorizedChatId = initialExecution.pending?.chatId ?? initial.chatId;
  const initialChat = authorizedChatId
    ? await chatRepo.findById(authorizedChatId)
    : null;
  if (
    !initialChat ||
    initialChat.isDeleted ||
    initialChat.organizationId !== initial.organizationId ||
    !(await chatMemberRepo.isMember(initial.createdBy, authorizedChatId!)) ||
    (!(await hasPermissionForUser(
      initial.createdBy,
      initial.organizationId,
      "automation",
      "create",
      initialExecution.apiKeyPermissions,
    )) &&
      !(await hasPermissionForUser(
        initial.createdBy,
        initial.organizationId,
        "automation",
        "manage",
        initialExecution.apiKeyPermissions,
      )))
  ) {
    await db
      .update(scheduledTask)
      .set({
        status: "paused",
        metadata: sql`jsonb_set(${scheduledTask.metadata}, '{pausedReason}', ${JSON.stringify("The task owner no longer has access to run this automation in the destination chat.")}::jsonb)`,
        updatedAt: now,
      })
      .where(eq(scheduledTask.id, taskId));
    return;
  }
  const claimed = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(scheduledTask)
      .where(eq(scheduledTask.id, taskId))
      .for("update");
    if (!task || !task.chatId || ["paused", "failed"].includes(task.status))
      return null;
    const execution = executionMetadata(task.metadata);
    if ((execution.pending?.chatId ?? task.chatId) !== authorizedChatId)
      return null;
    if (execution.pending)
      return { task, pending: execution.pending, execution };
    if (task.status !== "active" || !task.nextRunAt || task.nextRunAt > now)
      return null;
    const pending: PendingExecution = {
      messageId: crypto.randomUUID(),
      chatId: task.chatId,
      prompt: task.prompt,
      dueAt: task.nextRunAt.toISOString(),
    };
    let next: Date | null;
    try {
      next = calculateNextRun(task, now);
    } catch (error) {
      await tx
        .update(scheduledTask)
        .set({
          status: "failed",
          metadata: {
            ...task.metadata,
            pausedReason:
              error instanceof Error
                ? error.message
                : "Invalid stored schedule",
          },
          updatedAt: now,
        })
        .where(eq(scheduledTask.id, task.id));
      return null;
    }
    await tx.insert(message).values({
      id: pending.messageId,
      chatId: task.chatId,
      authorType: "user",
      authorId: task.createdBy,
      role: "user",
      content: task.prompt,
      parts: [{ type: "text", text: task.prompt }],
      attachments: [],
    });
    await tx
      .update(scheduledTask)
      .set({
        lastRunAt: now,
        nextRunAt: next,
        status: next ? "active" : "completed",
        metadata: {
          ...task.metadata,
          _execution: { ...execution, pending, lastError: undefined },
        },
        updatedAt: now,
      })
      .where(eq(scheduledTask.id, task.id));
    return { task, pending, execution };
  });
  if (!claimed) return;
  const { task, pending, execution } = claimed;
  execution.apiKeyPermissions = await currentAutomationPermissions({
    userId: task.createdBy,
    ...execution,
  });
  const chat = await chatRepo.findById(pending.chatId);
  const permitted =
    chat &&
    !chat.isDeleted &&
    chat.organizationId === task.organizationId &&
    (await chatMemberRepo.isMember(task.createdBy, pending.chatId)) &&
    ((await hasPermissionForUser(
      task.createdBy,
      task.organizationId,
      "automation",
      "create",
      execution.apiKeyPermissions,
    )) ||
      (await hasPermissionForUser(
        task.createdBy,
        task.organizationId,
        "automation",
        "manage",
        execution.apiKeyPermissions,
      )));
  if (!permitted) {
    await db
      .update(scheduledTask)
      .set({
        status: "paused",
        metadata: sql`jsonb_set(${scheduledTask.metadata}, '{pausedReason}', ${JSON.stringify("The task owner no longer has access to run this automation in the destination chat.")}::jsonb)`,
        updatedAt: now,
      })
      .where(eq(scheduledTask.id, task.id));
    return;
  }
  const run = await workflowRunService.start({
    chatId: pending.chatId,
    messageId: pending.messageId,
    messages: [
      {
        id: pending.messageId,
        role: "user",
        parts: [{ type: "text", text: pending.prompt }],
      },
    ],
    triggerType: "user_message",
    actor: {
      userId: task.createdBy,
      organizationId: task.organizationId,
      apiKeyPermissions: execution.apiKeyPermissions,
      apiKeyId: execution.apiKeyId ?? undefined,
      timeZone: task.timezone,
    },
  });
  // start() has durably stored the run. Its own recovery worker can now resume
  // it even if this process exits before run(). Preserve concurrent UI edits.
  await db
    .update(scheduledTask)
    .set({
      metadata: sql`jsonb_set(${scheduledTask.metadata}, '{_execution}', (coalesce(${scheduledTask.metadata}->'_execution', '{}'::jsonb) - 'pending' - 'lastError') || ${JSON.stringify({ lastRunId: run.runId, lastOutcome: "queued" })}::jsonb)`,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduledTask.id, task.id),
        sql`${scheduledTask.metadata}->'_execution'->'pending'->>'messageId' = ${pending.messageId}`,
      ),
    );
  void workflowRunService
    .run(run.runId)
    .then(async () => {
      const saved = await db.query.workflowRun.findFirst({
        where: eq(workflowRun.id, run.runId),
      });
      const outcome = saved?.status ?? "failed";
      await db
        .update(scheduledTask)
        .set({
          metadata: sql`jsonb_set(${scheduledTask.metadata}, '{_execution,lastOutcome}', ${JSON.stringify(outcome)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduledTask.id, task.id),
            sql`${scheduledTask.metadata}->'_execution'->>'lastRunId' = ${run.runId}`,
          ),
        );
    })
    .catch(async () => {
      await db
        .update(scheduledTask)
        .set({
          metadata: sql`jsonb_set(${scheduledTask.metadata}, '{_execution,lastOutcome}', '"failed"'::jsonb)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduledTask.id, task.id),
            sql`${scheduledTask.metadata}->'_execution'->>'lastRunId' = ${run.runId}`,
          ),
        );
    })
    .catch((error) =>
      logger.error("Unable to persist scheduled run outcome", {
        taskId,
        runId: run.runId,
        error: error instanceof Error ? error.message : "Database unavailable",
      }),
    );
}
