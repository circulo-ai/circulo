export type WorkflowTiming = {
  activeTimeMs: number;
  idleTimeMs: number;
  elapsedTimeMs: number;
  sampledAtMs: number;
  isActive: boolean;
};

export type WorkflowTimingEvent = {
  id: string;
  eventType: string;
  timestamp: number;
  stepId?: string | null;
  durationMs?: number | null;
};

/** Engine-step intervals measure work. Approval polling gaps and time with the
 * app closed between steps belong to elapsed/idle time, not execution time.
 * Input order is the durable event sequence, including equal timestamps. */
export function calculateWorkflowTiming(
  events: WorkflowTimingEvent[],
  now: number,
): WorkflowTiming | undefined {
  const seen = new Set<string>();
  const open = new Map<string, number>();
  const intervals: Array<[number, number]> = [];
  let start: number | undefined;
  let end: number | undefined;
  let last = 0;
  for (const event of events) {
    if (seen.has(event.id) || !Number.isFinite(event.timestamp)) continue;
    seen.add(event.id);
    const time = event.timestamp;
    last = Math.max(last, time);
    if (
      event.eventType === "workflow.started" ||
      event.eventType === "workflow.step.started"
    )
      start ??= time;
    if (event.eventType === "workflow.step.started" && event.stepId)
      open.set(event.stepId, time);
    if (event.eventType === "workflow.step.completed") {
      const began = event.stepId ? open.get(event.stepId) : undefined;
      const duration = event.durationMs;
      if (
        typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration >= 0
      )
        intervals.push([Math.max(start ?? time, time - duration), time]);
      else if (began !== undefined) intervals.push([began, time]);
      if (event.stepId) open.delete(event.stepId);
    }
    if (
      [
        "workflow.waiting",
        "workflow.paused",
        "workflow.retrying",
        "workflow.completed",
        "workflow.failed",
      ].includes(event.eventType)
    ) {
      for (const began of open.values()) intervals.push([began, time]);
      open.clear();
    }
    if (
      event.eventType === "workflow.completed" ||
      event.eventType === "workflow.failed"
    ) {
      end = time;
      break;
    }
  }
  if (start === undefined) return;
  const sampledAtMs = end ?? Math.max(Number.isFinite(now) ? now : last, last);
  for (const began of open.values()) intervals.push([began, sampledAtMs]);
  // Union intervals: replayed or overlapping observations must not double count.
  let activeTimeMs = 0;
  let previousEnd = start;
  for (const [left, right] of intervals.sort((a, b) => a[0] - b[0])) {
    const from = Math.max(start, previousEnd, left);
    const to = Math.min(sampledAtMs, right);
    activeTimeMs += Math.max(0, to - from);
    previousEnd = Math.max(previousEnd, to);
  }
  const elapsedTimeMs = Math.max(0, sampledAtMs - start);
  activeTimeMs = Math.min(elapsedTimeMs, activeTimeMs);
  return {
    activeTimeMs,
    idleTimeMs: elapsedTimeMs - activeTimeMs,
    elapsedTimeMs,
    sampledAtMs,
    isActive: end === undefined && open.size > 0,
  };
}
