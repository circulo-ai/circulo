import type {
  WorkflowEvent,
  WorkflowEventBus,
  WorkflowEventStreamGateway,
  WorkflowStreamOptions,
} from "../models";
import { WorkflowAccessTokenSigner } from "./access-token";

export class SecureWorkflowStreamGateway implements WorkflowEventStreamGateway {
  constructor(
    private readonly eventBus: WorkflowEventBus,
    private readonly tokens: WorkflowAccessTokenSigner,
    private readonly tenantResolver?:
      | ((workflowId: string) => string | Promise<string | undefined> | undefined)
      | undefined,
  ) {}

  async subscribe(
    workflowId: string,
    token: string,
    callback: (event: WorkflowEvent<unknown>) => void | Promise<void>,
    options: Pick<WorkflowStreamOptions, "tenantId"> = {},
  ): Promise<() => void> {
    const claims = await this.tokens.verify(token);
    const tenantId = options.tenantId ?? (await this.tenantResolver?.(workflowId));
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, callback);
  }

  async *stream(
    workflowId: string,
    token: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (maxBufferedEvents < 1) throw new RangeError("maxBufferedEvents must be positive");
    const events: WorkflowEvent<unknown>[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const unsubscribe = await this.subscribe(
      workflowId,
      token,
      (event) => {
        if (events.length >= maxBufferedEvents) events.shift();
        events.push(event);
        wake?.();
        wake = undefined;
      },
      options,
    );
    const abort = () => {
      closed = true;
      wake?.();
      wake = undefined;
    };
    if (options.signal?.aborted) closed = true;
    options.signal?.addEventListener("abort", abort, { once: true });

    try {
      while (!closed) {
        const event = events.shift();
        if (event) {
          yield event;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      closed = true;
      unsubscribe();
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
