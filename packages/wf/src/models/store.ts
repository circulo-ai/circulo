import type { Workflow, WorkflowEvent, WorkflowState } from "./workflow";

export interface WorkflowStore<TContext, TInput, TOutput> {
  saveWorkflow(wf: Workflow<TContext, TInput, TOutput>): Promise<void>;
  loadWorkflow(id: string): Promise<Workflow<TContext, TInput, TOutput> | null>;
  updateWorkflow(
    wf: Workflow<TContext, TInput, TOutput>,
    expectedVersion: number
  ): Promise<boolean>;
  deleteWorkflow(id: string): Promise<void>;
  listWorkflows(
    filter?: WorkflowFilter
  ): Promise<Workflow<TContext, TInput, TOutput>[]>;
  acquireLock(workflowId: string, ttl: number): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
  renewLock(lock: Lock, ttl: number): Promise<boolean>;
}

export interface WorkflowFilter {
  state?: WorkflowState;
  tags?: Record<string, string>;
  createdAfter?: number;
  createdBefore?: number;
  limit?: number;
}

export interface Lock {
  id: string;
  workflowId: string;
  acquiredAt: number;
  expiresAt: number;
  holder: string;
}

export interface EventStore<TOutput> {
  append(event: WorkflowEvent<TOutput>): Promise<void>;
  appendBatch(events: WorkflowEvent<TOutput>[]): Promise<void>;
  list(
    workflowId: string,
    fromTimestamp?: number
  ): Promise<WorkflowEvent<TOutput>[]>;
  clear(workflowId: string): Promise<void>;
  count(workflowId: string): Promise<number>;
}
