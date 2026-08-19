import type {
  WorkflowHistoryEvent,
  WorkflowHistoryEventBus,
  WorkflowHistoryEventStreamGateway,
  WorkflowHistoryStreamOptions,
} from "../models";
import { WorkflowAccessTokenSigner } from "./access-token";

export class SecureWorkflowHistoryStreamGateway implements WorkflowHistoryEventStreamGateway {
  constructor(
    private readonly eventBus: WorkflowHistoryEventBus,
    private readonly tokens: WorkflowAccessTokenSigner,
    private readonly tenantResolver?:
      ((workflowId: string, runId: string) => string | Promise<string | undefined> | undefined)
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
    const tenantId = options.tenantId ?? (await this.tenantResolver?.(workflowId, runId));
    this.tokens.authorize(claims, workflowId, "workflow:stream", tenantId);
    return this.eventBus.subscribe(workflowId, runId, callback);
  }

  async *stream(
    workflowId: string,
    token: string,
    options: WorkflowHistoryStreamOptions,
  ): AsyncIterable<WorkflowHistoryEvent> {
    const maxBufferedEvents = options.maxBufferedEvents ?? 1000;
    if (maxBufferedEvents < 1) throw new RangeError("maxBufferedEvents must be positive");
    const events: WorkflowHistoryEvent[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const unsubscribe = await this.subscribe(
      workflowId,
      options.runId,
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
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally {
      closed = true;
      unsubscribe();
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
