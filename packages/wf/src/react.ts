import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowEngine } from "./engine/workflow-engine";
import type {
  Workflow,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowHookContext,
  WorkflowHookHandler,
  WorkflowHookName,
  WorkflowHookRegistrationOptions,
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
  const [workflow, setWorkflow] = useState<
    Workflow<TContext, TInput, TOutput> | null
  >(null);
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
): { events: WorkflowEvent<TOutput>[]; isLoading: boolean; error: Error | null } {
  const maxEvents = Math.max(1, options.maxEvents ?? 100);
  const eventTypes = options.eventTypes;
  const [events, setEvents] = useState<WorkflowEvent<TOutput>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const matches = (event: WorkflowEvent<TOutput>): boolean =>
      eventTypes === undefined || eventTypes.includes(event.eventType);

    const load = async (): Promise<void> => {
      try {
        const loaded = (await engine.getEvents(workflowId)).filter(matches);
        if (active && !receivedEvent) {
          setEvents(loaded.slice(-maxEvents));
          setError(null);
        }
      } catch (cause) {
        if (active) setError(toError(cause));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    setIsLoading(true);
    void load();
    const unsubscribe = engine.subscribe(workflowId, (event) => {
      if (!active || !matches(event)) return;
      receivedEvent = true;
      setIsLoading(false);
      setEvents((current) => [...current, event].slice(-maxEvents));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine, workflowId, eventTypes, maxEvents]);

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

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
