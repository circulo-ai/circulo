import type { WorkflowTiming } from "@circulo-ai/types";

export function formatWorkflowDuration(value: number): string {
  const ms = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** Advance from a local receipt time, not a subtraction of client/server clocks. */
export function projectWorkflowTiming(
  timing: WorkflowTiming,
  now: number,
  receivedAt: number,
  terminal: boolean,
): WorkflowTiming {
  const delta = !terminal && receivedAt > 0 ? Math.max(0, now - receivedAt) : 0;
  return {
    ...timing,
    elapsedTimeMs: timing.elapsedTimeMs + delta,
    activeTimeMs: timing.activeTimeMs + (timing.isActive ? delta : 0),
    idleTimeMs: timing.idleTimeMs + (timing.isActive ? 0 : delta),
  };
}
