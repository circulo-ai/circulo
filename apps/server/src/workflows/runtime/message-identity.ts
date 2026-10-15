import { createHash } from "node:crypto";

/** A stable, database-compatible UUID for a workflow's assistant projection. */
export function workflowAssistantMessageId(runId: string): string {
  const hex = createHash("sha256").update(`assistant:${runId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
