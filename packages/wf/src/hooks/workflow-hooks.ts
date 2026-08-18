import { generateId } from "../utils/id";
import type {
  WorkflowHookContext,
  WorkflowHookErrorContext,
  WorkflowHookHandler,
  WorkflowHookManagerOptions,
  WorkflowHookName,
  WorkflowHookRegistrationOptions,
} from "../models/hooks";

interface Registration<TContext, TInput, TOutput> {
  id: string;
  name: WorkflowHookName | "*";
  handler: WorkflowHookHandler<TContext, TInput, TOutput>;
  priority: number;
  once: boolean;
}

/**
 * Typed lifecycle hook registry for workflow engines and integrations.
 *
 * Handlers run in priority order and are awaited. A failing handler is
 * reported and isolated by default, which keeps telemetry and UI listeners
 * from taking down durable work. `failFast` is available for transactional
 * integrations that intentionally make hooks part of the operation.
 */
export class WorkflowHookManager<TContext, TInput, TOutput> {
  private readonly registrations = new Map<
    string,
    Registration<TContext, TInput, TOutput>
  >();
  private readonly onError: (
    error: unknown,
    context: WorkflowHookErrorContext<TContext, TInput, TOutput>,
  ) => void | Promise<void>;
  private readonly failFast: boolean;
  private disposed = false;

  constructor(options: WorkflowHookManagerOptions<TContext, TInput, TOutput> = {}) {
    this.onError = options.onError ?? (() => undefined);
    this.failFast = options.failFast ?? false;
  }

  get size(): number {
    return this.registrations.size;
  }

  on(
    name: WorkflowHookName | "*",
    handler: WorkflowHookHandler<TContext, TInput, TOutput>,
    options: WorkflowHookRegistrationOptions = {},
  ): () => void {
    if (this.disposed) {
      throw new Error("Cannot register a hook after the hook manager is disposed");
    }
    if (!Number.isFinite(options.priority ?? 0)) {
      throw new RangeError("Hook priority must be a finite number");
    }

    const id = generateId("hook");
    this.registrations.set(id, {
      id,
      name,
      handler,
      priority: options.priority ?? 0,
      once: options.once ?? false,
    });

    return () => this.remove(id);
  }

  onAny(
    handler: WorkflowHookHandler<TContext, TInput, TOutput>,
    options?: WorkflowHookRegistrationOptions,
  ): () => void {
    return this.on("*", handler, options);
  }

  once(
    name: WorkflowHookName | "*",
    handler: WorkflowHookHandler<TContext, TInput, TOutput>,
    options: Omit<WorkflowHookRegistrationOptions, "once"> = {},
  ): () => void {
    return this.on(name, handler, { ...options, once: true });
  }

  remove(registrationId: string): boolean {
    return this.registrations.delete(registrationId);
  }

  clear(): void {
    this.registrations.clear();
  }

  async emit(context: WorkflowHookContext<TContext, TInput, TOutput>): Promise<void> {
    if (this.disposed) return;

    const handlers = [...this.registrations.values()]
      .filter((registration) =>
        registration.name === "*" || registration.name === context.name,
      )
      .sort((left, right) => right.priority - left.priority);

    for (const registration of handlers) {
      if (registration.once) this.registrations.delete(registration.id);

      try {
        await registration.handler(context);
      } catch (error) {
        const errorContext: WorkflowHookErrorContext<TContext, TInput, TOutput> =
          { ...context, registrationId: registration.id };
        try {
          await this.onError(error, errorContext);
        } catch (handlerError) {
          if (this.failFast) throw handlerError;
        }
        if (this.failFast) throw error;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.registrations.clear();
  }
}

/** Friendly alias for applications that prefer the shorter name. */
export { WorkflowHookManager as WorkflowHooks };

