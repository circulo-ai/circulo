import { db, workflowRunEvent } from "@/db";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

export type AgentTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";

export type AgentTaskLedgerEntry = {
  taskId: string;
  agentId: string;
  task: string;
  order: number;
  iteration: number;
  priority: "low" | "medium" | "high";
  dependsOn: string[];
  status: AgentTaskStatus;
  attempt: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
};

export type AgentTaskDescriptor = Pick<
  AgentTaskLedgerEntry,
  "agentId" | "task" | "order" | "iteration" | "priority" | "dependsOn"
>;

export type AgentTaskResult = Pick<AgentTaskLedgerEntry, "agentId" | "task"> & {
  success: boolean;
  error?: string;
};

export type AgentLoopSnapshot = {
  iteration: number;
  phase:
    | "planned"
    | "executing"
    | "observing"
    | "evaluating"
    | "decided"
    | "completed";
  resultCount: number;
  status?: "completed" | "blocked";
  reason?: string;
  decision?: "complete" | "continue" | "blocked";
  ledger: AgentTaskLedgerEntry[];
};

const AGENT_LOOP_SNAPSHOT_EVENT = "agent.loop.snapshot";

/** Stable event IDs make workflow retries safe without adding another table. */
export function deterministicWorkflowEventId(
  namespace: string,
  workflowId: string,
  key: string,
): string {
  const digest = createHash("sha256")
    .update(`${namespace}\u001f${workflowId}\u001f${key}`)
    .digest("hex");
  return `${namespace}:${workflowId}:${digest}`;
}

export function createAgentTaskId(descriptor: AgentTaskDescriptor): string {
  return deterministicWorkflowEventId(
    "agent-task",
    descriptor.agentId,
    `${descriptor.iteration}:${descriptor.order}:${descriptor.task}`,
  );
}

export function addAgentTasks(
  ledger: AgentTaskLedgerEntry[],
  descriptors: AgentTaskDescriptor[],
  now = Date.now(),
): AgentTaskLedgerEntry[] {
  const next = [...ledger];
  const existingIds = new Set(next.map((entry) => entry.taskId));

  for (const descriptor of descriptors) {
    const taskId = createAgentTaskId(descriptor);
    if (existingIds.has(taskId)) continue;
    next.push({
      ...descriptor,
      taskId,
      dependsOn: [...descriptor.dependsOn],
      status: "pending",
      attempt: 1,
      createdAt: now,
    });
    existingIds.add(taskId);
  }

  return next;
}

export function markAgentTasksRunning(
  ledger: AgentTaskLedgerEntry[],
  descriptors: AgentTaskDescriptor[],
  now = Date.now(),
): AgentTaskLedgerEntry[] {
  const taskIds = new Set(descriptors.map(createAgentTaskId));
  return ledger.map((entry) =>
    taskIds.has(entry.taskId) && entry.status === "pending"
      ? { ...entry, status: "running", startedAt: now }
      : entry,
  );
}

export function recordAgentTaskResults(
  ledger: AgentTaskLedgerEntry[],
  results: AgentTaskResult[],
  now = Date.now(),
): AgentTaskLedgerEntry[] {
  const next = [...ledger];
  for (const result of results) {
    // Dynamic replanning can reuse an agent for a materially different task.
    // Match the newest unfinished task so an older completed task is never
    // overwritten by a later observation.
    const index = findLatestMatchingTask(next, result);
    if (index < 0) continue;
    const entry = next[index]!;
    next[index] = {
      ...entry,
      status: result.success
        ? "completed"
        : result.error?.startsWith("Skipped") ||
            result.error === "Dependencies not met"
          ? "skipped"
          : "failed",
      completedAt: now,
      ...(result.error ? { error: result.error } : {}),
    };
  }
  return next;
}

export function markUnfinishedAgentTasksBlocked(
  ledger: AgentTaskLedgerEntry[],
  reason: string,
  now = Date.now(),
): AgentTaskLedgerEntry[] {
  return ledger.map((entry) =>
    entry.status === "pending" || entry.status === "running"
      ? {
          ...entry,
          status: "blocked",
          completedAt: now,
          error: reason,
        }
      : entry,
  );
}

function findLatestMatchingTask(
  ledger: AgentTaskLedgerEntry[],
  result: AgentTaskResult,
): number {
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    const entry = ledger[index];
    if (
      entry &&
      entry.agentId === result.agentId &&
      entry.task === result.task &&
      (entry.status === "pending" || entry.status === "running")
    ) {
      return index;
    }
  }
  return -1;
}

export async function persistDurableAgentLoopSnapshot(
  workflowId: string,
  snapshot: AgentLoopSnapshot,
): Promise<void> {
  await db
    .insert(workflowRunEvent)
    .values({
      id: deterministicWorkflowEventId(
        "agent-loop-snapshot",
        workflowId,
        `${snapshot.iteration}:${snapshot.phase}`,
      ),
      workflowId,
      timestamp: Date.now(),
      eventType: AGENT_LOOP_SNAPSHOT_EVENT,
      payload: snapshot,
    })
    .onConflictDoNothing({ target: workflowRunEvent.id });
}

export async function loadDurableAgentLoopSnapshots(
  workflowId: string,
): Promise<AgentLoopSnapshot[]> {
  const rows = await db
    .select()
    .from(workflowRunEvent)
    .where(
      and(
        eq(workflowRunEvent.workflowId, workflowId),
        eq(workflowRunEvent.eventType, AGENT_LOOP_SNAPSHOT_EVENT),
      ),
    );

  return rows.flatMap((row) => {
    const payload = row.payload as Partial<AgentLoopSnapshot>;
    return typeof payload.iteration === "number" &&
      typeof payload.phase === "string" &&
      Array.isArray(payload.ledger)
      ? [payload as AgentLoopSnapshot]
      : [];
  });
}
