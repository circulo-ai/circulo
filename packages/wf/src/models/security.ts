import type { WorkflowQueryView } from "./gateway";
import type { WorkflowHistoryEvent } from "./history";
import type { EventBus, Unsubscribe } from "./pubsub";
import type { Workflow, WorkflowEvent } from "./workflow";

export type WorkflowAccessScope =
  | "workflow:read"
  | "workflow:stream"
  | "workflow:control";

export interface WorkflowAccessClaims {
  subject: string;
  scopes: readonly WorkflowAccessScope[];
  workflowIds: readonly string[];
  tenantId?: string | undefined;
  issuedAt: number;
  expiresAt: number;
  tokenId: string;
}

export interface WorkflowAccessTokenOptions {
  expiresInMs?: number | undefined;
  issuer?: string | undefined;
}

export interface TokenRevocationStore {
  revoke(tokenId: string, expiresAt: number): Promise<void>;
  isRevoked(tokenId: string): Promise<boolean>;
  clearExpired(now?: number): Promise<number>;
}

export interface WorkflowStreamOptions {
  tenantId?: string | undefined;
  maxBufferedEvents?: number | undefined;
  signal?: AbortSignal | undefined;
}

export type WorkflowStreamUnsubscribe = Unsubscribe;

export interface WorkflowEventStreamGateway {
  subscribe(
    workflowId: string,
    token: string,
    callback: (event: WorkflowEvent<unknown>) => void | Promise<void>,
    options?: Pick<WorkflowStreamOptions, "tenantId">,
  ): Promise<WorkflowStreamUnsubscribe>;
  stream(
    workflowId: string,
    token: string,
    options?: WorkflowStreamOptions,
  ): AsyncIterable<WorkflowEvent<unknown>>;
}

export interface WorkflowHistoryStreamOptions extends WorkflowStreamOptions {
  runId: string;
}

export interface WorkflowHistoryEventStreamGateway {
  subscribe(
    workflowId: string,
    runId: string,
    token: string,
    callback: (event: WorkflowHistoryEvent) => void | Promise<void>,
    options?: Pick<WorkflowStreamOptions, "tenantId">,
  ): Promise<() => void>;
  stream(
    workflowId: string,
    token: string,
    options: WorkflowHistoryStreamOptions,
  ): AsyncIterable<WorkflowHistoryEvent>;
}

export type WorkflowEventBus = EventBus<unknown>;

export type WorkflowControlAction = "run" | "pause" | "resume" | "abort";

export interface WorkflowRemoteClient {
  queryWorkflow(
    workflowId: string,
    options?: { tenantId?: string | undefined },
  ): Promise<WorkflowQueryView>;
  streamWorkflowEvents(
    workflowId: string,
    options?: WorkflowStreamOptions,
  ): AsyncIterable<WorkflowEvent<unknown>>;
  controlWorkflow?(
    workflowId: string,
    action: WorkflowControlAction,
    payload?: { reason?: string | undefined; tenantId?: string | undefined },
  ): Promise<void>;
}

export type WorkflowRemoteSnapshot<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown,
> = Workflow<TContext, TInput, TOutput> | WorkflowQueryView;
