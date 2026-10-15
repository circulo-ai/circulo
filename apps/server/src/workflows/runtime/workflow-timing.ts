import { db, workflowRun, workflowRunEvent } from "@/db";
import type { ChatMessage } from "@/lib/types";
import {
  calculateWorkflowTiming,
  type WorkflowTiming,
  type WorkflowTimingEvent,
} from "@circulo-ai/types";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

const timingEvents = [
  "workflow.started",
  "workflow.step.started",
  "workflow.step.completed",
  "workflow.waiting",
  "workflow.paused",
  "workflow.retrying",
  "workflow.completed",
  "workflow.failed",
];

export async function loadWorkflowTimings(
  runIds: string[],
  chatId?: string,
): Promise<Map<string, WorkflowTiming>> {
  if (!runIds.length) return new Map();
  // Project only timing fields, not full step outputs or private tool results.
  const rows = await db
    .select({
      id: workflowRunEvent.id,
      workflowId: workflowRunEvent.workflowId,
      eventType: workflowRunEvent.eventType,
      timestamp: workflowRunEvent.timestamp,
      stepId: sql<string | null>`${workflowRunEvent.payload}->>'stepId'`,
      durationMs: sql<string | null>`${workflowRunEvent.payload}->>'duration'`,
    })
    .from(workflowRunEvent)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowRunEvent.workflowId))
    .where(
      and(
        inArray(workflowRunEvent.workflowId, runIds),
        inArray(workflowRunEvent.eventType, timingEvents),
        chatId ? sql`${workflowRun.input}->>'chatId' = ${chatId}` : undefined,
      ),
    )
    .orderBy(asc(workflowRunEvent.sequence));
  const groups = new Map<string, WorkflowTimingEvent[]>();
  for (const row of rows) {
    const group = groups.get(row.workflowId) ?? [];
    group.push({
      ...row,
      durationMs: row.durationMs === null ? null : Number(row.durationMs),
    });
    groups.set(row.workflowId, group);
  }
  const now = Date.now();
  const result = new Map<string, WorkflowTiming>();
  for (const [id, events] of groups) {
    const timing = calculateWorkflowTiming(events, now);
    if (timing) result.set(id, timing);
  }
  return result;
}

/** Also repairs the displayed timing of historic traces without rewriting chat data. */
export async function withWorkflowTimings(
  messages: ChatMessage[],
  chatId: string,
): Promise<ChatMessage[]> {
  const ids = new Set<string>();
  for (const message of messages)
    if (message.role === "assistant")
      for (const part of message.parts)
        if (part.type === "data-workflowTrace" && part.data?.workflowId)
          ids.add(part.data.workflowId);
  const timings = await loadWorkflowTimings([...ids], chatId);
  return messages.map((message) =>
    message.role !== "assistant"
      ? message
      : {
          ...message,
          parts: message.parts.map((part) =>
            part.type === "data-workflowTrace" &&
            timings.has(part.data.workflowId)
              ? {
                  ...part,
                  data: {
                    ...part.data,
                    timing: timings.get(part.data.workflowId),
                  },
                }
              : part,
          ),
        },
  );
}
