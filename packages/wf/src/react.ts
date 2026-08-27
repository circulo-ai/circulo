import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkflowEngine } from "./engine/workflow-engine";
import type {
  Workflow,
  WorkflowControlAction,
  WorkflowEvent,
  WorkflowEventStreamGateway,
  WorkflowEventType,
  WorkflowHookContext,
  WorkflowHookHandler,
  WorkflowHookName,
  WorkflowHookRegistrationOptions,
  WorkflowQueryView,
  WorkflowRemoteClient,
  WorkflowStreamOptions,
} from "./models";

export interface UseWorkflowResult<TContext, TInput, TOutput> {
  workflow: Workflow<TContext, TInput, TOutput> | null;
  lastEvent: WorkflowEvent<TOutput> | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  abort: (reason?: string) => Promise<void>;
}

/** Subscribe a React component to one durable workflow and its lifecycle. */
export function useWorkflow<TContext, TInput, TOutput>(
  engine: WorkflowEngine<TContext, TInput, TOutput>,
  workflowId: string,
): UseWorkflowResult<TContext, TInput, TOutput> {
  const [workflow, setWorkflow] = useState<Workflow<
    TContext,
    TInput,
    TOutput
  > | null>(null);
  const [lastEvent, setLastEvent] = useState<WorkflowEvent<TOutput> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setWorkflow(await engine.getWorkflow(workflowId));
      setError(null);
    } catch (cause) {
      setError(toError(cause));
    } finally {
      setIsLoading(false);
    }
  }, [engine, workflowId]);

  useEffect(() => {
    let active = true;
    let loadSequence = 0;
    const load = async (): Promise<void> => {
      const sequence = ++loadSequence;
      try {
        const current = await engine.getWorkflow(workflowId);
        if (active && sequence === loadSequence) {
          setWorkflow(current);
          setError(null);
        }
      } catch (cause) {
        if (active && sequence === loadSequence) setError(toError(cause));
      } finally {
        if (active && sequence === loadSequence) setIsLoading(false);
      }
    };

    setWorkflow(null);
    setLastEvent(null);
    setIsLoading(true);
    void load();
    const unsubscribe = engine.subscribe(workflowId, (event) => {
      if (!active) return;
      setLastEvent(event);
      void load();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine, workflowId]);

  const run = useCallback(() => engine.run(workflowId), [engine, workflowId]);
  const pause = useCallback(
    () => engine.pause(workflowId),
    [engine, workflowId],
  );
  const resume = useCallback(
    () => engine.resume(workflowId),
    [engine, workflowId],
  );
  const abort = useCallback(
    (reason?: string) => engine.abort(workflowId, reason),
    [engine, workflowId],
  );

  return {
    workflow,
    lastEvent,
    isLoading,
    error,
    refresh,
    run,
    pause,
    resume,
    abort,
  };
}

export interface UseWorkflowEventsOptions {
  eventTypes?: readonly WorkflowEventType[];
  maxEvents?: number;
}

/** Subscribe to a workflow event stream with bounded client-side history. */
export function useWorkflowEvents<TContext, TInput, TOutput>(
  engine: WorkflowEngine<TContext, TInput, TOutput>,
  workflowId: string,
  options: UseWorkflowEventsOptions = {},
): {
  events: WorkflowEvent<TOutput>[];
  isLoading: boolean;
  error: Error | null;
} {
  const maxEvents = Math.max(1, options.maxEvents ?? 100);
  const eventTypes = options.eventTypes;
  const eventTypesKey = eventTypes?.join("\u0000");
  const [events, setEvents] = useState<WorkflowEvent<TOutput>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const selectedEventTypes =
      eventTypes === undefined ? undefined : new Set(eventTypes);
    const matches = (event: WorkflowEvent<TOutput>): boolean =>
      selectedEventTypes === undefined ||
      selectedEventTypes.has(event.eventType);

    const load = async (): Promise<void> => {
      try {
        const loaded = (await engine.getEvents(workflowId)).filter(matches);
        if (active) {
          setEvents((current) =>
            receivedEvent
              ? mergeWorkflowEvents(current, loaded, maxEvents)
              : loaded.slice(-maxEvents),
          );
          setError(null);
        }
      } catch (cause) {
        if (active) setError(toError(cause));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    setEvents([]);
    setError(null);
    setIsLoading(true);
    void load();
    const unsubscribe = engine.subscribe(workflowId, (event) => {
      if (!active || !matches(event)) return;
      receivedEvent = true;
      setIsLoading(false);
      setEvents((current) => mergeWorkflowEvents(current, [event], maxEvents));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine, workflowId, eventTypesKey, maxEvents]);

  return { events, isLoading, error };
}

/** Register a lifecycle hook for the lifetime of a React component. */
export function useWorkflowHook<TContext, TInput, TOutput>(
  engine: WorkflowEngine<TContext, TInput, TOutput>,
  name: WorkflowHookName | "*",
  handler: WorkflowHookHandler<TContext, TInput, TOutput>,
  options?: WorkflowHookRegistrationOptions,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return engine.lifecycle.on(
      name,
      (context: WorkflowHookContext<TContext, TInput, TOutput>) =>
        handlerRef.current(context),
      options,
    );
  }, [engine, name, options?.once, options?.priority]);
}

const WorkflowClientContext = createContext<WorkflowRemoteClient | null>(null);

export interface WorkflowClientProviderProps {
  client: WorkflowRemoteClient;
  children?: ReactNode;
}

/** Provides a secure, token-bound backend client to remote workflow hooks. */
export function WorkflowClientProvider({
  client,
  children,
}: WorkflowClientProviderProps): ReactNode {
  return createElement(
    WorkflowClientContext.Provider,
    { value: client },
    children,
  );
}

export function useWorkflowClient(): WorkflowRemoteClient {
  const client = useContext(WorkflowClientContext);
  if (!client) {
    throw new Error(
      "useWorkflowClient must be used inside WorkflowClientProvider",
    );
  }
  return client;
}

export interface UseRemoteWorkflowOptions {
  tenantId?: string;
  refreshOnEvent?: boolean;
}

export interface UseRemoteWorkflowResult {
  workflow: WorkflowQueryView | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/** Queries a workflow projection and optionally refreshes it from its secure event stream. */
export function useRemoteWorkflow(
  workflowId: string,
  options: UseRemoteWorkflowOptions = {},
): UseRemoteWorkflowResult {
  const client = useWorkflowClient();
  const [workflow, setWorkflow] = useState<WorkflowQueryView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const tenantId = options.tenantId;
  const refreshOnEvent = options.refreshOnEvent ?? true;

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    setIsLoading(true);
    const request = (async () => {
      try {
        setWorkflow(
          await client.queryWorkflow(
            workflowId,
            tenantId ? { tenantId } : undefined,
          ),
        );
        setError(null);
      } catch (cause) {
        setError(toError(cause));
      } finally {
        setIsLoading(false);
      }
    })();
    refreshInFlight.current = request;
    try {
      await request;
    } finally {
      if (refreshInFlight.current === request) refreshInFlight.current = null;
    }
  }, [client, tenantId, workflowId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const value = await client.queryWorkflow(
          workflowId,
          tenantId ? { tenantId } : undefined,
        );
        if (active) {
          setWorkflow(value);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(toError(cause));
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    if (!refreshOnEvent)
      return () => {
        active = false;
      };
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const _event of client.streamWorkflowEvents(
          workflowId,
          tenantId
            ? { tenantId, signal: controller.signal }
            : { signal: controller.signal },
        )) {
          if (active) void refresh();
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(toError(cause));
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, refresh, refreshOnEvent, tenantId, workflowId]);

  return { workflow, isLoading, error, refresh };
}

export interface UseRemoteWorkflowEventsOptions extends WorkflowStreamOptions {
  eventTypes?: readonly WorkflowEventType[];
  maxEvents?: number;
}

/** Consumes an authenticated workflow stream with bounded client-side retention. */
export function useRemoteWorkflowEvents(
  workflowId: string,
  options: UseRemoteWorkflowEventsOptions = {},
): {
  events: WorkflowEvent<unknown>[];
  isLoading: boolean;
  error: Error | null;
} {
  const client = useWorkflowClient();
  const [events, setEvents] = useState<WorkflowEvent<unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const maxEvents = Math.max(1, options.maxEvents ?? 100);
  const eventTypes = options.eventTypes;
  const eventTypesKey = eventTypes?.join("\u0000");
  const tenantId = options.tenantId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const selectedEventTypes =
      eventTypes === undefined ? undefined : new Set(eventTypes);
    setIsLoading(true);
    setEvents([]);
    setError(null);
    void (async () => {
      try {
        const streamOptions: WorkflowStreamOptions = {
          maxBufferedEvents: options.maxBufferedEvents,
          tenantId,
          signal: controller.signal,
        };
        for await (const event of client.streamWorkflowEvents(
          workflowId,
          streamOptions,
        )) {
          if (!active) break;
          if (
            selectedEventTypes !== undefined &&
            !selectedEventTypes.has(event.eventType)
          )
            continue;
          setIsLoading(false);
          setEvents((current) =>
            mergeWorkflowEvents(current, [event], maxEvents),
          );
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(toError(cause));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    client,
    eventTypesKey,
    maxEvents,
    options.maxBufferedEvents,
    tenantId,
    workflowId,
  ]);

  return { events, isLoading, error };
}

export interface UseWorkflowControlsResult {
  run: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  abort: (reason?: string) => Promise<void>;
}

/** Exposes authenticated workflow controls when the configured client supports them. */
export function useWorkflowControls(
  workflowId: string,
  tenantId?: string,
): UseWorkflowControlsResult {
  const client = useWorkflowClient();
  const invoke = useCallback(
    (action: WorkflowControlAction, reason?: string) => {
      if (!client.controlWorkflow) {
        return Promise.reject(
          new Error("The workflow client does not support control operations"),
        );
      }
      const payload =
        tenantId === undefined ? { reason } : { reason, tenantId };
      return client.controlWorkflow(workflowId, action, payload);
    },
    [client, tenantId, workflowId],
  );
  return {
    run: () => invoke("run"),
    pause: () => invoke("pause"),
    resume: () => invoke("resume"),
    abort: (reason?: string) => invoke("abort", reason),
  };
}

/** Adapts the secure stream gateway directly to the remote client contract. */
export class WorkflowGatewayClient implements WorkflowRemoteClient {
  constructor(
    private readonly gateway: WorkflowEventStreamGateway,
    private readonly token: string,
    private readonly query?: (
      workflowId: string,
      tenantId?: string,
    ) => Promise<WorkflowQueryView>,
  ) {}

  async queryWorkflow(
    workflowId: string,
    options?: { tenantId?: string | undefined },
  ): Promise<WorkflowQueryView> {
    if (!this.query) throw new Error("No workflow query adapter is configured");
    return this.query(workflowId, options?.tenantId);
  }

  streamWorkflowEvents(
    workflowId: string,
    options: WorkflowStreamOptions = {},
  ): AsyncIterable<WorkflowEvent<unknown>> {
    return this.gateway.stream(workflowId, this.token, options);
  }
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function mergeWorkflowEvents<TOutput>(
  current: readonly WorkflowEvent<TOutput>[],
  incoming: readonly WorkflowEvent<TOutput>[],
  maxEvents: number,
): WorkflowEvent<TOutput>[] {
  const byId = new Map(current.map((event) => [event.id, event] as const));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()]
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp || left.id.localeCompare(right.id),
    )
    .slice(-maxEvents);
}
