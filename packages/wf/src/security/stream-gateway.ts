import type {
  WorkflowEvent,
  WorkflowEventBus,
  WorkflowEventStreamGateway,
  WorkflowStreamOptions,
} from "../models";
import { WorkflowAccessTokenSigner } from "./access-token";
import { createBufferedAsyncStream } from "./buffered-stream";

export class SecureWorkflowStreamGateway implements WorkflowEventStreamGateway {
  constructor(
    private readonly eventBus: WorkflowEventBus,
    private readonly tokens: WorkflowAccessTokenSigner,
    private readonly tenantResolver?:
      | ((
          workflowId: string,
        ) => string | Promise<string | undefined> | undefined)
      | undefined,
  ) {}

  async subscribe(
    workflowId: string,
    token: string,
    callback: (event: WorkflowEvent<unknown>) => void | Promise<void>,
    options: Pick<WorkflowStreamOptions, "tenantId"> = {},
  ): Promise<() => void> {
    const claims = await this.tokens.verify(token);
    const tenantId = await resolveTenantId(
      workflowId,
      options.tenantId,
      this.tenantResolver,
    );
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, callback);
  }

  stream(
    workflowId: string,
    token: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (!Number.isInteger(maxBufferedEvents) || maxBufferedEvents < 1)
      throw new RangeError("maxBufferedEvents must be a positive integer");
    return createBufferedAsyncStream<WorkflowEvent<unknown>>(
      async (push) => {
        const claims = await this.tokens.verify(token);
        const tenantId = await resolveTenantId(
          workflowId,
          options.tenantId,
          this.tenantResolver,
        );
        this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
        return this.eventBus.subscribe(workflowId, (event) => {
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
  requestedTenantId: string | undefined,
  resolver:
    | ((workflowId: string) => string | Promise<string | undefined> | undefined)
    | undefined,
): Promise<string | undefined> {
  if (!resolver) return requestedTenantId;
  const resolvedTenantId = await resolver(workflowId);
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
