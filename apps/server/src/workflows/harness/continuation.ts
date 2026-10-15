import type { Message } from "@/db";
import { db, workflowRun } from "@/db";
import type { HarnessSnapshot } from "@circulo-ai/types";
import { and, eq } from "drizzle-orm";
import { databaseHarnessJournal, type HarnessContinuation } from "./runtime";

/** An explicit continuation inherits only the same user's blocked execution in
 * the same authorized chat. New tool permissions are still resolved afresh. */
export async function loadHarnessContinuation(options: {
  task: string;
  messages: Message[];
  agentId: string;
  userId: string;
  organizationId: string;
  chatId: string;
}): Promise<HarnessContinuation | undefined> {
  if (!/^\s*(?:continue|keep going|resume|carry on)\b/i.test(options.task))
    return;
  const previous = [...options.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const trace = (
    previous?.parts as
      | Array<{
          type?: string;
          data?: {
            workflowId?: string;
            agents?: Array<{ harness?: HarnessSnapshot }>;
          };
        }>
      | undefined
  )?.find((part) => part.type === "data-workflowTrace")?.data;
  const candidate = trace?.agents
    ?.map((agent) => agent.harness)
    .find(
      (snapshot) =>
        snapshot?.agentId === options.agentId && snapshot.status === "blocked",
    );
  if (!trace?.workflowId || !candidate) return;
  const [authorized] = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.id, trace.workflowId),
        eq(workflowRun.userId, options.userId),
        eq(workflowRun.organizationId, options.organizationId),
        eq(workflowRun.chatId, options.chatId),
      ),
    )
    .limit(1);
  if (!authorized) return;
  const events = await databaseHarnessJournal(
    authorized.id,
    candidate.executionId,
  ).load();
  const snapshot = [...events]
    .reverse()
    .find((event) => event.type === "harness.snapshot")?.payload.state as
    | HarnessSnapshot
    | undefined;
  if (
    !snapshot ||
    snapshot.status !== "blocked" ||
    snapshot.agentId !== options.agentId
  )
    return;
  return {
    snapshot,
    events: events.filter((event) => event.type === "harness.tool"),
  };
}
