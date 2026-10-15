import { db, humanApproval, scheduledTask } from "@/db";
import { createLogger } from "@/lib/logs/console/logger";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { dispatchScheduledTask } from "./scheduled-dispatch";

const logger = createLogger("Scheduler");
const SCHEDULER_KEY = Symbol.for("circulo.scheduler");
const schedulerState = globalThis as unknown as {
  [SCHEDULER_KEY]?: ReturnType<typeof setInterval>;
};
let databaseRetryAt = 0;
let ticking = false;

export async function tickScheduler() {
  if (ticking || Date.now() < databaseRetryAt) return;
  ticking = true;
  try {
    await expirePendingApprovals();
    const due = await db.query.scheduledTask.findMany({
      where: or(
        and(
          eq(scheduledTask.status, "active"),
          lte(scheduledTask.nextRunAt, new Date()),
        ),
        and(
          sql`${scheduledTask.status} in ('active', 'completed')`,
          sql`${scheduledTask.metadata}->'_execution'->'pending' is not null`,
        ),
      ),
      orderBy: asc(scheduledTask.nextRunAt),
      limit: 20,
    });
    databaseRetryAt = 0;
    for (const task of due) {
      try {
        await dispatchScheduledTask(task.id);
      } catch (error) {
        logger.error("Task dispatch failed; durable intent will be retried", {
          taskId: task.id,
          error: error instanceof Error ? error.message : "Dispatch failed",
        });
        databaseRetryAt = Date.now() + 30_000;
      }
    }
  } catch (error) {
    databaseRetryAt = Date.now() + 30_000;
    logger.error(
      "Database unavailable; retrying in 30 seconds",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    ticking = false;
  }
}

async function expirePendingApprovals(): Promise<void> {
  const now = new Date();
  const expired = await db
    .update(humanApproval)
    .set({ status: "expired", decidedAt: now })
    .where(
      and(
        eq(humanApproval.status, "pending"),
        lte(humanApproval.expiresAt, now),
      ),
    )
    .returning({ workflowRunId: humanApproval.workflowRunId });
  for (const runId of new Set(
    expired
      .map((row) => row.workflowRunId)
      .filter((id): id is string => Boolean(id)),
  )) {
    await workflowRunService
      .resume(runId)
      .catch((error) =>
        logger.error("Could not resume expired approval", { runId, error }),
      );
  }
}

export function startScheduler(): () => void {
  if (!schedulerState[SCHEDULER_KEY]) {
    void tickScheduler();
    schedulerState[SCHEDULER_KEY] = setInterval(
      () => void tickScheduler(),
      15_000,
    );
  }
  return stopScheduler;
}
export function stopScheduler(): void {
  const interval = schedulerState[SCHEDULER_KEY];
  if (interval) clearInterval(interval);
  schedulerState[SCHEDULER_KEY] = undefined;
}
