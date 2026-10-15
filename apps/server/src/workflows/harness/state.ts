import type { HarnessSnapshot, HarnessTask } from "@circulo-ai/types";
import { createHash } from "node:crypto";
import { z } from "zod";

export const planTaskSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  title: z.string().trim().min(1).max(500),
  verification: z.string().trim().min(1).max(1000),
  evidenceKind: z.enum(["tool", "response"]),
  expectedTools: z.array(z.string().min(1).max(200)).max(12),
  dependsOn: z.array(z.string().min(1).max(64)).max(24),
});
export type PlanTask = z.infer<typeof planTaskSchema>;
export type ToolEvidence = {
  toolCallId: string;
  toolName: string;
  successful: boolean;
  fingerprint: string;
};

export const DEFAULT_HARNESS_LIMITS = {
  modelSteps: 40,
  toolCalls: 120,
  tokens: 250_000,
  runtimeMs: 10 * 60_000,
  contextCharacters: 120_000,
  repeatCalls: 3,
};

/** Planning hints only; actual completion still requires observed evidence. */
export function needsHarnessPlan(goal: string): boolean {
  return (
    goal.length > 400 ||
    /\b(durable plan|multi-step|track (?:the |my )?(?:work|progress))\b/i.test(
      goal,
    ) ||
    /^\s*(research|investigate|audit)\b/i.test(goal) ||
    (/\b(create|write|update|save|build)\b/i.test(goal) &&
      /\b(document|report|file|workflow|spreadsheet)\b/i.test(goal))
  );
}

export function toolFingerprint(name: string, input: unknown): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
  return createHash("sha256")
    .update(`${name}\n${JSON.stringify(canonical(input))}`)
    .digest("hex");
}

export function toolOutputSucceeded(output: unknown): boolean {
  if (!output || typeof output !== "object") return true;
  const result = output as Record<string, unknown>;
  return (
    result.isError !== true &&
    result.success !== false &&
    !result.error &&
    ![
      "pending",
      "approval-required",
      "rejected",
      "failed",
      "cancelled",
      "expired",
      "error",
    ].includes(String(result.status ?? ""))
  );
}

export function revisePlan(
  state: HarnessSnapshot,
  definitions: PlanTask[],
  availableTools: Set<string>,
): HarnessTask[] {
  definitions = definitions.map((task) => ({
    ...task,
    expectedTools: [
      ...new Set(
        task.expectedTools.map((name) => {
          const canonical = name.startsWith("functions.")
            ? name.slice(10)
            : name;
          return availableTools.has(canonical) ? canonical : name;
        }),
      ),
    ],
  }));
  if (!definitions.length || definitions.length > 24)
    throw new Error("A plan needs 1–24 tasks.");
  const ids = new Set(definitions.map((task) => task.id));
  if (ids.size !== definitions.length)
    throw new Error("Plan task IDs must be unique.");
  for (const existing of state.tasks) {
    if (!ids.has(existing.id))
      throw new Error(
        `Keep task ${existing.id}; unfinished requirements cannot be silently removed.`,
      );
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Plan dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    const definition = definitions.find((task) => task.id === id)!;
    for (const dependency of definition.dependsOn) {
      if (!ids.has(dependency))
        throw new Error(`Unknown dependency ${dependency}.`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of definitions) {
    if (task.evidenceKind === "tool" && !task.expectedTools.length)
      throw new Error(
        `Task ${task.id} needs an expected tool for verification.`,
      );
    if (task.expectedTools.some((name) => !availableTools.has(name)))
      throw new Error(
        `Task ${task.id} names an unavailable tool. Available names: ${[...availableTools].join(", ") || "none"}.`,
      );
    visit(task.id);
  }
  return definitions.map((definition) => {
    const previous = state.tasks.find((task) => task.id === definition.id);
    const changed =
      previous &&
      toolFingerprint("task", {
        title: previous.title,
        verification: previous.verification,
        evidenceKind: previous.evidenceKind,
        expectedTools: previous.expectedTools,
        dependsOn: previous.dependsOn,
      }) !== toolFingerprint("task", definitionWithoutId(definition));
    if (changed && previous.status === "completed")
      throw new Error(
        `Completed task ${definition.id} is immutable; add a new task for additional work.`,
      );
    return {
      ...definition,
      status: changed ? "pending" : (previous?.status ?? "pending"),
      evidence: changed ? [] : (previous?.evidence ?? []),
      note: changed ? "" : (previous?.note ?? ""),
    };
  });
}

function definitionWithoutId(task: PlanTask) {
  const { id: _, ...definition } = task;
  return definition;
}

export function updateTask(
  state: HarnessSnapshot,
  update: {
    id: string;
    status: HarnessTask["status"];
    evidence: string[];
    note: string;
  },
  evidence: ToolEvidence[],
): HarnessTask[] {
  const target = state.tasks.find((task) => task.id === update.id);
  if (!target) throw new Error("Choose a task ID from the current plan.");
  if (target.status === "completed" && update.status !== "completed")
    throw new Error(
      "Completed tasks cannot be reopened; add a follow-up task.",
    );
  if (
    ["running", "completed"].includes(update.status) &&
    target.dependsOn.some(
      (id) =>
        state.tasks.find((task) => task.id === id)?.status !== "completed",
    )
  )
    throw new Error(
      `Complete dependencies first: ${target.dependsOn.filter((id) => state.tasks.find((task) => task.id === id)?.status !== "completed").join(", ")}. Report their actual successful evidence before completing ${target.id}.`,
    );
  if (
    update.status === "running" &&
    state.tasks.some(
      (task) => task.id !== update.id && task.status === "running",
    )
  )
    throw new Error("Finish or block the active task before starting another.");
  if (update.status === "completed") {
    if (!update.note.trim()) throw new Error("Describe the verified outcome.");
    if (target.evidenceKind === "tool") {
      const proofs = update.evidence.map((id) =>
        evidence.find((item) => item.toolCallId === id),
      );
      if (!proofs.length || proofs.some((proof) => !proof?.successful))
        throw new Error(
          "Completion needs successful tool call IDs from this execution.",
        );
      if (
        target.expectedTools.some(
          (name) => !proofs.some((proof) => proof?.toolName === name),
        )
      )
        throw new Error("Evidence does not cover all required tools.");
    }
  }
  return state.tasks.map((task) =>
    task.id === update.id ? { ...task, ...update } : task,
  );
}

export function assessCompletion(
  state: HarnessSnapshot,
  output: string,
  finishReason: string,
  evidence: ToolEvidence[],
  stopReason?: string,
): { success: boolean; reason?: string } {
  if (stopReason) return { success: false, reason: stopReason };
  if (
    ["length", "error", "tool-calls", "content-filter"].includes(finishReason)
  )
    return {
      success: false,
      reason: `Execution stopped with ${finishReason}; the goal is not verified complete.`,
    };
  if (!output.trim())
    return { success: false, reason: "The agent returned no final response." };
  if (state.tasks.some((task) => task.status !== "completed"))
    return {
      success: false,
      reason:
        "The execution plan still has unfinished or blocked requirements.",
    };
  if (!state.tasks.length && evidence.some((item) => !item.successful))
    return {
      success: false,
      reason:
        "A tool failed or requires approval; completion has not been verified.",
    };
  return { success: true };
}
