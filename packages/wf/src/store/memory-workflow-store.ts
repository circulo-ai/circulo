import type { Lock, Workflow, WorkflowFilter, WorkflowStore } from "../models";
import { generateId } from "../utils/id";

export class InMemoryWorkflowStore<
  TContext,
  TInput,
  TOutput,
> implements WorkflowStore<TContext, TInput, TOutput> {
  private workflows = new Map<string, Workflow<TContext, TInput, TOutput>>();
  private locks = new Map<string, Lock>();
  private readonly holderId: string;
  private readonly lockCleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.holderId = generateId("holder");
    this.lockCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [workflowId, lock] of this.locks.entries()) {
        if (lock.expiresAt <= now) {
          this.locks.delete(workflowId);
        }
      }
    }, 1000);
    const timer = this.lockCleanupTimer as ReturnType<typeof setInterval> & {
      unref?: () => void;
    };
    timer.unref?.();
  }

  private cloneWorkflow(
    wf: Workflow<TContext, TInput, TOutput>,
  ): Workflow<TContext, TInput, TOutput> {
    // Clone serializable parts deeply, but keep step functions intact via shallow copy
    const { steps, ...rest } = wf;
    const cloned = structuredClone(rest);
    const clonedSteps = steps.map((step) => ({ ...step }));
    return { ...cloned, steps: clonedSteps };
  }

  async saveWorkflow(wf: Workflow<TContext, TInput, TOutput>): Promise<void> {
    this.workflows.set(wf.id, this.cloneWorkflow(wf));
  }

  async loadWorkflow(
    id: string,
  ): Promise<Workflow<TContext, TInput, TOutput> | null> {
    const wf = this.workflows.get(id);
    return wf ? this.cloneWorkflow(wf) : null;
  }

  async updateWorkflow(
    wf: Workflow<TContext, TInput, TOutput>,
    expectedVersion: number,
  ): Promise<boolean> {
    const existing = this.workflows.get(wf.id);
    if (!existing) {
      throw new Error(`Workflow ${wf.id} not found`);
    }

    if (existing.version !== expectedVersion) {
      return false;
    }

    const updated = this.cloneWorkflow(wf);
    updated.version = expectedVersion + 1;
    updated.updatedAt = Date.now();
    // keep caller's reference in sync for optimistic locking
    wf.version = updated.version;
    wf.updatedAt = updated.updatedAt;
    this.workflows.set(wf.id, updated);
    return true;
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
    this.locks.delete(id);
  }

  async listWorkflows(
    filter?: WorkflowFilter,
  ): Promise<Workflow<TContext, TInput, TOutput>[]> {
    let results = Array.from(this.workflows.values());

    if (filter?.state) {
      results = results.filter((wf) => wf.state === filter.state);
    }

    if (filter?.tags) {
      const tags = filter.tags;
      results = results.filter((wf) => {
        return Object.entries(tags).every(
          ([key, value]) => wf.tags[key] === value,
        );
      });
    }

    if (filter?.createdAfter !== undefined) {
      const createdAfter = filter.createdAfter;
      results = results.filter((wf) => wf.createdAt >= createdAfter);
    }

    if (filter?.createdBefore !== undefined) {
      const createdBefore = filter.createdBefore;
      results = results.filter((wf) => wf.createdAt <= createdBefore);
    }

    if (filter?.resumeBefore !== undefined) {
      const resumeBefore = filter.resumeBefore;
      results = results.filter(
        (wf) => wf.resumeAt !== undefined && wf.resumeAt <= resumeBefore,
      );
    }

    if (filter?.limit !== undefined) {
      results = results.slice(0, filter.limit);
    }

    return results.map((wf) => this.cloneWorkflow(wf));
  }

  async acquireLock(workflowId: string, ttl: number): Promise<Lock | null> {
    const existing = this.locks.get(workflowId);
    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      return null;
    }

    const lock: Lock = {
      id: generateId("lock"),
      workflowId,
      acquiredAt: now,
      expiresAt: now + ttl,
      holder: this.holderId,
    };

    this.locks.set(workflowId, lock);
    return lock;
  }

  async releaseLock(lock: Lock): Promise<void> {
    const existing = this.locks.get(lock.workflowId);
    if (existing?.id === lock.id && existing.holder === this.holderId) {
      this.locks.delete(lock.workflowId);
    }
  }

  async renewLock(lock: Lock, ttl: number): Promise<boolean> {
    const existing = this.locks.get(lock.workflowId);
    if (
      !existing ||
      existing.id !== lock.id ||
      existing.holder !== this.holderId
    ) {
      return false;
    }

    existing.expiresAt = Date.now() + ttl;
    return true;
  }

  dispose(): void {
    clearInterval(this.lockCleanupTimer);
    this.clear();
  }

  clear(): void {
    this.workflows.clear();
    this.locks.clear();
  }
}
