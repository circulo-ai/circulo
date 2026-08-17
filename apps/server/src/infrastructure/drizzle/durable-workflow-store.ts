import { db, workflowRun, workflowRunEvent } from "@/db";
import type {
  EventStore,
  Lock,
  Step,
  Workflow,
  WorkflowEvent,
  WorkflowFilter,
  WorkflowStore,
} from "@circulo-ai/wf";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

type JsonRecord = Record<string, unknown>;

type WorkflowOwner<TInput> = (input: TInput) => {
  chatId: string;
  userId: string;
  organizationId: string;
};

/**
 * PostgreSQL workflow store. Workflow functions are rebuilt from the current
 * definition on load; all mutable execution state and locks live in Postgres.
 */
export class DurableWorkflowStore<
  TContext,
  TInput,
  TOutput,
> implements WorkflowStore<TContext, TInput, TOutput> {
  private readonly holder = crypto.randomUUID();

  constructor(
    private readonly stepsFactory: () => Step<TContext, unknown, unknown>[],
    private readonly ownerOf: WorkflowOwner<TInput>,
  ) {}

  async saveWorkflow(wf: Workflow<TContext, TInput, TOutput>): Promise<void> {
    const owner = this.ownerOf(wf.input);
    const values = this.toRow(wf, owner);
    await db.insert(workflowRun).values(values).onConflictDoUpdate({
      target: workflowRun.id,
      set: values,
    });
  }

  async loadWorkflow(
    id: string,
  ): Promise<Workflow<TContext, TInput, TOutput> | null> {
    const row = await db.query.workflowRun.findFirst({
      where: eq(workflowRun.id, id),
    });
    return row ? this.fromRow(row) : null;
  }

  async updateWorkflow(
    wf: Workflow<TContext, TInput, TOutput>,
    expectedVersion: number,
  ): Promise<boolean> {
    const owner = this.ownerOf(wf.input);
    const values = this.toRow(wf, owner);
    const updated = await db
      .update(workflowRun)
      .set({ ...values, version: expectedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(workflowRun.id, wf.id),
          eq(workflowRun.version, expectedVersion),
        ),
      )
      .returning({ id: workflowRun.id });

    if (updated.length === 0) return false;
    wf.version = expectedVersion + 1;
    wf.updatedAt = Date.now();
    return true;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await db.delete(workflowRun).where(eq(workflowRun.id, id));
  }

  async listWorkflows(
    filter?: WorkflowFilter,
  ): Promise<Workflow<TContext, TInput, TOutput>[]> {
    const rows = await db
      .select()
      .from(workflowRun)
      .orderBy(asc(workflowRun.createdAt));

    return rows
      .filter((row) => {
        if (filter?.state && row.state !== filter.state) return false;
        if (
          filter?.createdAfter !== undefined &&
          row.createdAt.getTime() < filter.createdAfter
        )
          return false;
        if (
          filter?.createdBefore !== undefined &&
          row.createdAt.getTime() > filter.createdBefore
        )
          return false;
        if (
          filter?.resumeBefore !== undefined &&
          (!row.resumeAt || row.resumeAt.getTime() > filter.resumeBefore)
        )
          return false;
        if (filter?.tags) {
          const tags = (row.tags ?? {}) as Record<string, string>;
          if (
            !Object.entries(filter.tags).every(
              ([key, value]) => tags[key] === value,
            )
          )
            return false;
        }
        return true;
      })
      .slice(0, filter?.limit)
      .map((row) => this.fromRow(row));
  }

  async acquireLock(workflowId: string, ttl: number): Promise<Lock | null> {
    const now = new Date();
    const lock: Lock = {
      id: crypto.randomUUID(),
      workflowId,
      acquiredAt: now.getTime(),
      expiresAt: now.getTime() + ttl,
      holder: this.holder,
    };
    const result = await db
      .update(workflowRun)
      .set({
        lockId: lock.id,
        lockHolder: lock.holder,
        lockAcquiredAt: now,
        lockExpiresAt: new Date(lock.expiresAt),
      })
      .where(
        and(
          eq(workflowRun.id, workflowId),
          or(
            isNull(workflowRun.lockExpiresAt),
            lt(workflowRun.lockExpiresAt, now),
          ),
        ),
      )
      .returning({ id: workflowRun.id });
    return result.length > 0 ? lock : null;
  }

  async releaseLock(lock: Lock): Promise<void> {
    await db
      .update(workflowRun)
      .set({
        lockId: null,
        lockHolder: null,
        lockAcquiredAt: null,
        lockExpiresAt: null,
      })
      .where(
        and(
          eq(workflowRun.id, lock.workflowId),
          eq(workflowRun.lockId, lock.id),
          eq(workflowRun.lockHolder, lock.holder),
        ),
      );
  }

  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttl);
    const result = await db
      .update(workflowRun)
      .set({ lockExpiresAt: expiresAt })
      .where(
        and(
          eq(workflowRun.id, lock.workflowId),
          eq(workflowRun.lockId, lock.id),
          eq(workflowRun.lockHolder, lock.holder),
        ),
      )
      .returning({ id: workflowRun.id });
    if (result.length === 0) return false;
    lock.expiresAt = expiresAt.getTime();
    return true;
  }

  private toRow(
    wf: Workflow<TContext, TInput, TOutput>,
    owner: { chatId: string; userId: string; organizationId: string },
  ) {
    return {
      id: wf.id,
      chatId: owner.chatId,
      userId: owner.userId,
      organizationId: owner.organizationId,
      status: toStatus(wf.state),
      state: wf.state,
      version: wf.version,
      currentStep: wf.currentStep,
      retryCount: wf.retryCount,
      maxExecutionTime: wf.maxExecutionTime ?? null,
      input: toJson(wf.input) as Record<string, unknown>,
      context: toJson(wf.context) as Record<string, unknown>,
      output: wf.output === undefined ? null : toJson(wf.output),
      error: wf.error ? (toJson(wf.error) as Record<string, unknown>) : null,
      tags: wf.tags,
      metadata: toJson(wf.metadata) as Record<string, unknown>,
      resumeAt: wf.resumeAt ? new Date(wf.resumeAt) : null,
      executionStartedAt: wf.executionStartedAt
        ? new Date(wf.executionStartedAt)
        : null,
      createdAt: new Date(wf.createdAt),
      updatedAt: new Date(wf.updatedAt),
      completedAt: wf.completedAt ? new Date(wf.completedAt) : null,
    };
  }

  private fromRow(
    row: typeof workflowRun.$inferSelect,
  ): Workflow<TContext, TInput, TOutput> {
    return {
      id: row.id,
      version: row.version,
      state: row.state as Workflow<TContext, TInput, TOutput>["state"],
      steps: this.stepsFactory().map((step) => ({ ...step })),
      currentStep: row.currentStep,
      context: fromJson(row.context) as TContext,
      input: fromJson(row.input) as TInput,
      output:
        row.output === null ? undefined : (fromJson(row.output) as TOutput),
      error: row.error
        ? (fromJson(row.error) as Workflow<TContext, TInput, TOutput>["error"])
        : undefined,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      completedAt: row.completedAt?.getTime(),
      resumeAt: row.resumeAt?.getTime(),
      maxExecutionTime: row.maxExecutionTime ?? undefined,
      executionStartedAt: row.executionStartedAt?.getTime(),
      retryCount: row.retryCount,
      tags: row.tags ?? {},
      metadata: fromJson(row.metadata) as Record<string, unknown>,
    };
  }
}

export class DurableWorkflowEventStore<TOutput> implements EventStore<TOutput> {
  async append(event: WorkflowEvent<TOutput>): Promise<void> {
    await db.insert(workflowRunEvent).values({
      id: event.id,
      workflowId: event.workflowId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      payload: toJson(event.payload),
      correlationId: event.correlationId ?? null,
    });
  }

  async appendBatch(events: WorkflowEvent<TOutput>[]): Promise<void> {
    if (events.length === 0) return;
    await db.insert(workflowRunEvent).values(
      events.map((event) => ({
        id: event.id,
        workflowId: event.workflowId,
        timestamp: event.timestamp,
        eventType: event.eventType,
        payload: toJson(event.payload),
        correlationId: event.correlationId ?? null,
      })),
    );
  }

  async list(
    workflowId: string,
    fromTimestamp?: number,
  ): Promise<WorkflowEvent<TOutput>[]> {
    const rows = await db
      .select()
      .from(workflowRunEvent)
      .where(eq(workflowRunEvent.workflowId, workflowId))
      .orderBy(asc(workflowRunEvent.timestamp));
    return rows
      .filter(
        (row) => fromTimestamp === undefined || row.timestamp >= fromTimestamp,
      )
      .map((row) => ({
        id: row.id,
        workflowId: row.workflowId,
        timestamp: row.timestamp,
        eventType: row.eventType as WorkflowEvent<TOutput>["eventType"],
        payload: fromJson(row.payload) as WorkflowEvent<TOutput>["payload"],
        correlationId: row.correlationId ?? undefined,
      }));
  }

  async clear(workflowId: string): Promise<void> {
    await db
      .delete(workflowRunEvent)
      .where(eq(workflowRunEvent.workflowId, workflowId));
  }

  async count(workflowId: string): Promise<number> {
    const rows = await db
      .select({ id: workflowRunEvent.id })
      .from(workflowRunEvent)
      .where(eq(workflowRunEvent.workflowId, workflowId));
    return rows.length;
  }
}

function toStatus(
  state: Workflow<never, never, never>["state"],
): "running" | "paused" | "completed" | "failed" {
  return state === "completed"
    ? "completed"
    : state === "failed"
      ? "failed"
      : state === "paused"
        ? "paused"
        : "running";
}

function toJson(value: unknown): JsonRecord | unknown[] | unknown {
  return JSON.parse(JSON.stringify(value)) as JsonRecord | unknown[] | unknown;
}

function fromJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(fromJson);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = reviveDate(key, child);
  }
  return result;
}

function reviveDate(key: string, value: unknown): unknown {
  if (typeof value === "string" && ["startTime", "endTime"].includes(key)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fromJson(value);
}
