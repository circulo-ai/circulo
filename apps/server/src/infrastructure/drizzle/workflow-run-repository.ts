import type { DbInstance } from "@/db";
import { workflowRun } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export class DrizzleWorkflowRunRepository {
  constructor(private readonly db: DbInstance) {}

  async create(input: {
    id: string;
    chatId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    // The workflow engine creates the durable execution row before returning
    // its run id. This remains an idempotent compatibility hook for callers
    // that register ownership after start().
    await this.db.insert(workflowRun).values(input).onConflictDoNothing();
  }

  async findOwnedById(input: {
    id: string;
    userId: string;
    organizationId: string;
  }) {
    return this.db.query.workflowRun.findFirst({
      where: and(
        eq(workflowRun.id, input.id),
        eq(workflowRun.userId, input.userId),
        eq(workflowRun.organizationId, input.organizationId),
      ),
    });
  }

  async findByIdInOrganization(input: { id: string; organizationId: string }) {
    return this.db.query.workflowRun.findFirst({
      where: and(
        eq(workflowRun.id, input.id),
        eq(workflowRun.organizationId, input.organizationId),
      ),
    });
  }

  async markFinished(
    id: string,
    status: "completed" | "failed",
  ): Promise<void> {
    await this.db
      .update(workflowRun)
      .set({ status, completedAt: new Date() })
      .where(eq(workflowRun.id, id));
  }

  async markStatus(
    id: string,
    status: "running" | "paused" | "completed" | "failed",
  ): Promise<void> {
    await this.db
      .update(workflowRun)
      .set({
        status,
        completedAt:
          status === "completed" || status === "failed" ? new Date() : null,
      })
      .where(eq(workflowRun.id, id));
  }
}
