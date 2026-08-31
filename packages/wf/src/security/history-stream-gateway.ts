import type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventBus,
  WorkflowHistoryEventStreamGateway,
  WorkflowHistoryStreamOptions,
} from "../models";
import { WorkflowAccessTokenSigner } from "./access-token";
import { createBufferedAsyncStream } from "./buffered-stream";

export class SecureWorkflowHistoryStreamGateway implements WorkflowHistoryEventStreamGateway {
  constructor(
    private readonly eventBus: WorkflowHistoryEventBus,
    private readonly tokens: WorkflowAccessTokenSigner,
    private readonly tenantResolver?:
      | ((
          workflowId: string,
          runId: string,
        ) => string | Promise<string | undefined> | undefined)
      | undefined,
  ) {}

  async subscribe(
    workflowId: string,
    runId: string,
    token: string,
    callback: (event: WorkflowHistoryEvent) => void | Promise<void>,
    options: { tenantId?: string | undefined } = {},
  ): Promise<() => void> {
    const claims = await this.tokens.verify(token);
    const tenantId = await resolveTenantId(
      workflowId,
      runId,
      options.tenantId,
      this.tenantResolver,
    );
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, runId, callback);
  }

  stream(
    workflowId: string,
    token: string,
    options: WorkflowHistoryStreamOptions,
  ): AsyncIterable<WorkflowHistoryEvent> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (!Number.isInteger(maxBufferedEvents) || maxBufferedEvents < 1)
      throw new RangeError("maxBufferedEvents must be a positive integer");
    return createBufferedAsyncStream<WorkflowHistoryEvent>(
      async (push) => {
        const claims = await this.tokens.verify(token);
        const tenantId = await resolveTenantId(
          workflowId,
          options.runId,
          options.tenantId,
          this.tenantResolver,
        );
        this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
        return this.eventBus.subscribe(workflowId, options.runId, (event) => {
          push(event);
        });
      },
      maxBufferedEvents,
      options.signal,
    );
  }
}

async function resolveTenantId(
  workflowId: string,
  runId: string,
  requestedTenantId: string | undefined,
  resolver:
    | ((
        workflowId: string,
        runId: string,
      ) => string | Promise<string | undefined> | undefined)
    | undefined,
): Promise<string | undefined> {
  if (!resolver) return requestedTenantId;
  const resolvedTenantId = await resolver(workflowId, runId);
  if (resolvedTenantId === undefined) {
    throw new Error("Workflow tenant could not be resolved");
  }
  if (
    requestedTenantId !== undefined &&
    resolvedTenantId !== requestedTenantId
  ) {
    throw new Error("Requested tenant does not match the workflow tenant");
  }
  return resolvedTenantId;
}
