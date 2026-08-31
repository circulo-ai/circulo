import type { Agent } from "@/db";

export type OrchestrationAgentProfile = Pick<
  Agent,
  | "id"
  | "name"
  | "description"
  | "instructions"
  | "model"
  | "providerId"
  | "avatarUrl"
  | "maxTokens"
  | "temperature"
  | "defaultToolIds"
  | "toolAccessMode"
>;

/** The configured chat orchestrator is an agent identity, not only a model setting. */
export function formatOrchestrationAgentProfile(
  agent?: OrchestrationAgentProfile | null,
): string {
  if (!agent) return "";

  return `=== CONFIGURED ORCHESTRATION AGENT ===
ID: ${agent.id}
Name: ${agent.name}
Description: ${agent.description?.trim() || "No description provided."}
Model: ${agent.model}
Instructions:
${agent.instructions.trim()}
=== END ORCHESTRATION AGENT PROFILE ===`;
}
