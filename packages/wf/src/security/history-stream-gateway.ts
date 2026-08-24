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
    const tenantId =
      options.tenantId ?? (await this.tenantResolver?.(workflowId, runId));
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, runId, callback);
  }

  stream(
    workflowId: string,
    token: string,
    options: WorkflowHistoryStreamOptions,
  ): AsyncIterable<WorkflowHistoryEvent> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (maxBufferedEvents < 1)
      throw new RangeError("maxBufferedEvents must be positive");
    return createBufferedAsyncStream<WorkflowHistoryEvent>(
      async (push) => {
        const unsubscribe = this.eventBus.subscribe(
          workflowId,
          options.runId,
          (event) => {
            push(event);
          },
        );
        try {
          const claims = await this.tokens.verify(token);
          const tenantId =
            options.tenantId ??
            (await this.tenantResolver?.(workflowId, options.runId));
          this.tokens.authorize(
            claims,
            workflowId,
            "workflow:stream",
            tenantId,
          );
          return unsubscribe;
        } catch (error) {
          unsubscribe();
          throw error;
        }
      },
      maxBufferedEvents,
      options.signal,
    );
  }
}
