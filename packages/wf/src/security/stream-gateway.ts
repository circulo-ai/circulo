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
    const tenantId =
      options.tenantId ?? (await this.tenantResolver?.(workflowId));
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, callback);
  }

  stream(
    workflowId: string,
    token: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (maxBufferedEvents < 1)
      throw new RangeError("maxBufferedEvents must be positive");
    return createBufferedAsyncStream<WorkflowEvent<unknown>>(
      async (push) => {
        const unsubscribe = this.eventBus.subscribe(workflowId, (event) => {
          push(event);
        });
        try {
          const claims = await this.tokens.verify(token);
          const tenantId =
            options.tenantId ?? (await this.tenantResolver?.(workflowId));
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
