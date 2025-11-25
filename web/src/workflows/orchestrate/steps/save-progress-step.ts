// workflows/orchestrate/steps/save-progress-step.ts

import { db } from "@/db";
import { workflowProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";

interface WorkflowProgress {
  chatId: string;
  messageId: string;
  status:
    | "started"
    | "classifying"
    | "planning"
    | "executing"
    | "aggregating"
    | "completed"
    | "failed";
  currentAgent?: string;
  completedAgents: string[];
  totalAgents: number;
  progress: number; // 0-100
  estimatedTimeRemaining?: number;
  lastUpdate: Date;
}

export async function saveWorkflowProgressStep(
  progress: WorkflowProgress,
): Promise<void> {
  "use step";

  await db
    .insert(workflowProgress)
    .values({
      chatId: progress.chatId,
      messageId: progress.messageId,
      status: progress.status,
      currentAgent: progress.currentAgent || null,
      completedAgents: progress.completedAgents,
      totalAgents: progress.totalAgents,
      progress: progress.progress,
      estimatedTimeRemaining: progress.estimatedTimeRemaining || null,
      lastUpdate: progress.lastUpdate,
    })
    .onConflictDoUpdate({
      target: [workflowProgress.chatId, workflowProgress.messageId],
      set: {
        status: progress.status,
        currentAgent: progress.currentAgent || null,
        completedAgents: progress.completedAgents,
        totalAgents: progress.totalAgents,
        progress: progress.progress,
        estimatedTimeRemaining: progress.estimatedTimeRemaining || null,
        lastUpdate: progress.lastUpdate,
      },
    });
}

export async function getWorkflowProgress(
  chatId: string,
  messageId: string,
): Promise<WorkflowProgress | null> {
  "use step";

  const result = await db.query.workflowProgress.findFirst({
    where: and(
      eq(workflowProgress.chatId, chatId),
      eq(workflowProgress.messageId, messageId),
    ),
  });

  if (!result) return null;

  return {
    chatId: result.chatId,
    messageId: result.messageId,
    status: result.status as any,
    currentAgent: result.currentAgent || undefined,
    completedAgents: result.completedAgents as string[],
    totalAgents: result.totalAgents,
    progress: result.progress,
    estimatedTimeRemaining: result.estimatedTimeRemaining || undefined,
    lastUpdate: result.lastUpdate,
  };
}

export async function deleteWorkflowProgress(
  chatId: string,
  messageId: string,
): Promise<void> {
  "use step";
  await db
    .delete(workflowProgress)
    .where(
      and(
        eq(workflowProgress.chatId, chatId),
        eq(workflowProgress.messageId, messageId),
      ),
    );
}
