import { WorkflowHookManager } from "../hooks/workflow-hooks";
import type {
  ErrorType,
  EventBus,
  EventStore,
  Lock,
  Logger,
  MetricsCollector,
  Step,
  StepResult,
  Workflow,
  WorkflowContext,
  WorkflowError,
  WorkflowEvent,
  WorkflowEventPayload,
  WorkflowEventType,
  WorkflowStore,
} from "../models";
import { exponentialBackoff } from "../utils/backoff";
import { generateId } from "../utils/id";

interface RunnerConfig {
  defaultTimeout?: number | undefined;
  defaultRetries?: number | undefined;
  lockTTL?: number | undefined;
  lockRenewInterval?: number | undefined;
}

class StepFailure extends Error {
  constructor(readonly workflowError: WorkflowError) {
    super(workflowError.message);
    this.name = "StepFailure";
  }
}

class WorkflowAborted extends Error {
  constructor() {
    super("Workflow aborted");
    this.name = "AbortError";
  }
}

export class WorkflowRunner<TContext, TInput, TOutput> {
  private abortControllers = new Map<string, AbortController>();
  private pauseFlags = new Map<string, boolean>();
  private contextUpdates = new Map<string, Partial<TContext>>();
  private stepAppends = new Map<string, Step<TContext, unknown, unknown>[]>();
  private locks = new Map<string, Lock>();
  private lockRenewTimers = new Map<string, ReturnType<typeof setInterval>>();
  private lockRenewalActive = new Map<string, boolean>();

  constructor(
    private workflowStore: WorkflowStore<TContext, TInput, TOutput>,
    private eventStore: EventStore<TOutput>,
    private eventBus: EventBus<TOutput>,
    private logger: Logger,
    private metrics: MetricsCollector,
    private config: RunnerConfig = {},
    private hooks: WorkflowHookManager<
      TContext,
      TInput,
      TOutput
    > = new WorkflowHookManager<TContext, TInput, TOutput>(),
  ) {}

  async run(
    workflowId: string,
    transform?: (output: TOutput) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    const lock = await this.acquireWorkflowLock(workflowId);
    if (!lock) {
      this.logger.warn("Failed to acquire lock for workflow", { workflowId });
      return;
    }

    try {
      const workflow = await this.workflowStore.loadWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      if (workflow.state === "completed" || workflow.state === "failed") {
        return;
      }

      this.startLockRenewal(workflowId, lock);

      const controller = new AbortController();
      this.abortControllers.set(workflowId, controller);

      try {
        await this.executeWorkflow(workflow, controller.signal, transform);
      } finally {
        this.abortControllers.delete(workflowId);
        this.pauseFlags.delete(workflowId);
        this.contextUpdates.delete(workflowId);
        this.stepAppends.delete(workflowId);
      }
    } catch (err) {
      this.logger.error("Workflow execution failed", err as Error, {
        workflowId,
      });
      throw err;
    } finally {
      await this.releaseWorkflowLock(workflowId, lock);
    }
  }

  async pause(workflowId: string): Promise<void> {
    this.pauseFlags.set(workflowId, true);
    const workflow = await this.workflowStore.loadWorkflow(workflowId);
    if (
      !workflow ||
      workflow.state === "completed" ||
      workflow.state === "failed"
    ) {
      this.pauseFlags.delete(workflowId);
      return;
    }
    if (
      workflow.state === "running" &&
      !this.abortControllers.has(workflowId)
    ) {
      const success = await this.updateWorkflowState(workflow, "paused");
      if (success) {
        const currentStep = workflow.steps[workflow.currentStep];
        await this.emitEvent(
          workflowId,
          "workflow.paused",
          {
            type: "paused",
            stepId: currentStep?.id ?? "",
          },
          workflow,
        );
        this.logger.info("Workflow paused", { workflowId });
      }
    }
  }

  async resume(workflowId: string): Promise<void> {
    this.pauseFlags.delete(workflowId);
    const workflow = await this.workflowStore.loadWorkflow(workflowId);

    if (!workflow) return;
    if (workflow.state === "completed" || workflow.state === "failed") {
      this.pauseFlags.delete(workflowId);
      return;
    }

    // A pause request can race with an approval decision while the current
    // step is still executing. In that case the durable row is still
    // `running`; clearing the flag lets the active runner continue. If no
    // runner is active, start one so a decision cannot strand the workflow.
    if (workflow.state === "running") {
      if (!this.abortControllers.has(workflowId)) {
        await this.run(workflowId);
      }
      return;
    }

    if (workflow.state === "paused") {
      workflow.resumeAt = undefined;
      const success = await this.updateWorkflowState(workflow, "running");
      if (success) {
        const currentStep = workflow.steps[workflow.currentStep];
        await this.emitEvent(
          workflowId,
          "workflow.resumed",
          {
            type: "resumed",
            stepId: currentStep?.id ?? "",
          },
          workflow,
        );
        this.logger.info("Workflow resumed", { workflowId });
        await this.run(workflowId);
      }
    }
  }

  async abort(
    workflowId: string,
    reason: string,
    errorType: ErrorType = "permanent",
  ): Promise<void> {
    const controller = this.abortControllers.get(workflowId);
    if (controller) {
      controller.abort();
    }

    const workflow = await this.workflowStore.loadWorkflow(workflowId);
    if (
      workflow &&
      workflow.state !== "completed" &&
      workflow.state !== "failed"
    ) {
      workflow.state = "failed";
      workflow.error = {
        type: errorType,
        message: reason,
        retryable: false,
        timestamp: Date.now(),
      };
      workflow.resumeAt = undefined;
      workflow.completedAt = Date.now();

      const success = await this.updateWorkflowWithVersion(workflow);
      if (success) {
        await this.emitEvent(
          workflowId,
          "workflow.failed",
          {
            type: "failed",
            error: workflow.error,
          },
          workflow,
        );
        this.logger.info("Workflow aborted", { workflowId, reason });
      }
    } else {
      this.pauseFlags.delete(workflowId);
    }
  }

  private async executeWorkflow(
    workflow: Workflow<TContext, TInput, TOutput>,
    signal: AbortSignal,
    transform?: (output: TOutput) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    const now = Date.now();
    const startTime = workflow.executionStartedAt ?? now;

    if (!workflow.executionStartedAt) {
      workflow.executionStartedAt = now;
    }

    workflow.resumeAt = undefined;
    workflow.state = "running";
    await this.updateWorkflowWithVersion(workflow);

    if (workflow.currentStep === 0) {
      await this.emitEvent(
        workflow.id,
        "workflow.started",
        {
          type: "started",
          workflowId: workflow.id,
          version: workflow.version,
        },
        workflow,
      );
    }

    while (workflow.currentStep < workflow.steps.length) {
      if (signal.aborted) {
        return;
      }

      if (this.pauseFlags.get(workflow.id)) {
        if (workflow.state !== "paused") {
          workflow.state = "paused";
          await this.updateWorkflowWithVersion(workflow);
          const currentStep = workflow.steps[workflow.currentStep];
          await this.emitEvent(
            workflow.id,
            "workflow.paused",
            {
              type: "paused",
              stepId: currentStep?.id ?? "",
            },
            workflow,
          );
        }
        return;
      }

      if (!this.lockRenewalActive.get(workflow.id)) {
        this.logger.error("Lock renewal failed, aborting workflow", undefined, {
          workflowId: workflow.id,
        });
        await this.failWorkflow(workflow, {
          type: "permanent",
          message: "Lock renewal failed",
          retryable: false,
          timestamp: Date.now(),
        });
        return;
      }

      if (this.isWorkflowTimedOut(workflow)) {
        await this.failWorkflow(workflow, {
          type: "timeout",
          message: "Workflow exceeded maximum execution time",
          retryable: false,
          timestamp: Date.now(),
        });
        return;
      }

      const step = workflow.steps[workflow.currentStep];
      if (!step) {
        throw new Error(`Step at index ${workflow.currentStep} not found`);
      }

      const stepLogger = this.logger.child({
        stepId: step.id,
        stepName: step.name,
      });
      const ctx = this.createContext(workflow, stepLogger, signal);

      try {
        const stepStartTime = Date.now();
        await this.emitEvent(
          workflow.id,
          "workflow.step.started",
          {
            type: "step.started",
            stepId: step.id,
            stepName: step.name,
            attempt: workflow.retryCount,
          },
          workflow,
        );

        const input =
          workflow.currentStep === 0 ? workflow.input : workflow.output;
        const result = await this.executeStep(
          step,
          input,
          ctx,
          signal,
          stepLogger,
        );

        if (result.type === "error") {
          throw new StepFailure(result.error);
        }

        const duration = Date.now() - stepStartTime;

        if (result.type === "wait") {
          if (result.data !== undefined) {
            workflow.output = result.data as TOutput;
          }

          await this.emitEvent(
            workflow.id,
            "workflow.step.completed",
            {
              type: "step.completed",
              stepId: step.id,
              data: (result.data ?? workflow.output) as TOutput,
              duration,
            },
            workflow,
          );

          this.metrics.recordStepSuccess(step.name);
          this.metrics.recordStepDuration(step.name, duration);

          this.applyContextUpdates(workflow);
          this.applyStepAppends(workflow);

          if (!result.resumeCurrentStep) workflow.currentStep++;
          workflow.retryCount = 0;
          workflow.state = "paused";
          workflow.resumeAt = result.until;
          await this.updateWorkflowWithVersion(workflow);

          await this.emitEvent(
            workflow.id,
            "workflow.waiting",
            {
              type: "waiting",
              stepId: step.id,
              resumeAt: result.until,
            },
            workflow,
          );

          stepLogger.info("Step requested wait", {
            resumeAt: result.until,
            duration,
          });
          return;
        }

        workflow.output = result.data as TOutput;

        await this.emitEvent(
          workflow.id,
          "workflow.step.completed",
          {
            type: "step.completed",
            stepId: step.id,
            data: result.data as TOutput,
            duration,
          },
          workflow,
        );

        this.metrics.recordStepSuccess(step.name);
        this.metrics.recordStepDuration(step.name, duration);

        this.applyContextUpdates(workflow);
        this.applyStepAppends(workflow);

        workflow.currentStep++;
        workflow.retryCount = 0;
        await this.updateWorkflowWithVersion(workflow);

        stepLogger.info("Step completed successfully", { duration });
      } catch (err) {
        if (signal.aborted || err instanceof WorkflowAborted) {
          return;
        }

        const error =
          err instanceof StepFailure
            ? err.workflowError
            : this.classifyError(toError(err), step);
        stepLogger.error("Step failed", toError(err), {
          errorType: error.type,
        });

        this.metrics.recordStepFailure(step.name, error.type);

        if (
          error.retryable &&
          workflow.retryCount <
            (step.retries ?? this.config.defaultRetries ?? 0)
        ) {
          await this.handleRetry(workflow, step, error, signal);
        } else {
          if (step.compensation && workflow.currentStep > 0) {
            try {
              const compensationInput =
                workflow.currentStep === 0 ? workflow.input : workflow.output;
              await step.compensation(compensationInput, ctx);
              this.logger.info("Compensation executed", {
                stepId: step.id,
                stepName: step.name,
              });
            } catch (compensationErr) {
              this.logger.error(
                "Compensation failed",
                compensationErr as Error,
                {
                  stepId: step.id,
                },
              );
            }
          }

          await this.failWorkflow(workflow, error);
          throw err;
        }
      }
    }

    // Apply transform if provided
    if (transform && workflow.output !== undefined) {
      try {
        workflow.output = await transform(workflow.output);
      } catch (err) {
        this.logger.error("Output transform failed", err as Error, {
          workflowId: workflow.id,
        });
        await this.failWorkflow(workflow, {
          type: "permanent",
          message: `Output transform failed: ${(err as Error).message}`,
          retryable: false,
          timestamp: Date.now(),
        });
        throw err;
      }
    }

    workflow.state = "completed";
    workflow.completedAt = Date.now();
    const totalDuration = workflow.completedAt - startTime;
    await this.updateWorkflowWithVersion(workflow);

    await this.emitEvent(
      workflow.id,
      "workflow.completed",
      {
        type: "completed",
        output: workflow.output as TOutput,
        duration: totalDuration,
      },
      workflow,
    );

    this.metrics.recordWorkflowSuccess();
    this.metrics.recordWorkflowDuration(totalDuration);
    this.logger.info("Workflow completed successfully", {
      workflowId: workflow.id,
      duration: totalDuration,
    });
  }

  private async handleRetry(
    workflow: Workflow<TContext, TInput, TOutput>,
    step: Step<TContext, unknown, unknown>,
    _error: WorkflowError,
    signal: AbortSignal,
  ): Promise<void> {
    workflow.retryCount++;
    const backoff = step.backoff ?? exponentialBackoff;
    const delay = backoff(workflow.retryCount);

    await this.emitEvent(
      workflow.id,
      "workflow.retrying",
      {
        type: "retrying",
        stepId: step.id,
        attempt: workflow.retryCount,
        delay,
      },
      workflow,
    );

    this.metrics.recordStepRetry(step.name, workflow.retryCount);
    this.logger.info("Retrying step", {
      stepId: step.id,
      attempt: workflow.retryCount,
      delay,
    });

    await this.updateWorkflowWithVersion(workflow);
    await this.sleep(delay, signal);
  }

  private async failWorkflow(
    workflow: Workflow<TContext, TInput, TOutput>,
    error: WorkflowError,
  ): Promise<void> {
    workflow.state = "failed";
    workflow.error = error;
    workflow.resumeAt = undefined;
    workflow.completedAt = Date.now();
    await this.updateWorkflowWithVersion(workflow);

    await this.emitEvent(
      workflow.id,
      "workflow.failed",
      {
        type: "failed",
        error,
      },
      workflow,
    );

    this.metrics.recordWorkflowFailure(error.type);
    this.logger.error("Workflow failed", undefined, {
      workflowId: workflow.id,
      errorType: error.type,
      message: error.message,
    });
  }

  private async executeStep<TStepInput, TStepOutput>(
    step: Step<TContext, TStepInput, TStepOutput>,
    input: TStepInput,
    ctx: WorkflowContext<TContext>,
    signal: AbortSignal,
    logger: Logger,
  ): Promise<StepResult<TStepOutput>> {
    const timeout = step.timeout ?? this.config.defaultTimeout;

    try {
      const result = step.run(input, ctx);

      if (this.isAsyncGenerator(result)) {
        return await this.executeGeneratorStep(
          result,
          ctx.workflow.id,
          step.id,
          timeout,
          signal,
          logger,
        );
      } else {
        return await this.executePromiseStep(result, timeout, signal);
      }
    } catch (err) {
      const error = this.classifyError(
        err as Error,
        step as Step<TContext, unknown, unknown>,
      );
      return { type: "error", error };
    }
  }

  private async executePromiseStep<TStepOutput>(
    promise: Promise<StepResult<TStepOutput>>,
    timeout: number | undefined,
    signal: AbortSignal,
  ): Promise<StepResult<TStepOutput>> {
    if (signal.aborted) throw new WorkflowAborted();

    const result = await this.withTimeout(
      promise,
      timeout,
      signal,
      () => new Error(`Step timeout after ${timeout}ms`),
    );
    return result;
  }

  private async executeGeneratorStep<TStepOutput>(
    generator: AsyncGenerator<
      StepResult<TStepOutput>,
      StepResult<TStepOutput>,
      unknown
    >,
    workflowId: string,
    stepId: string,
    timeout: number | undefined,
    signal: AbortSignal,
    logger: Logger,
  ): Promise<StepResult<TStepOutput>> {
    const startTime = Date.now();

    try {
      while (true) {
        if (signal.aborted) {
          throw new WorkflowAborted();
        }

        const remaining =
          timeout === undefined
            ? undefined
            : Math.max(0, timeout - (Date.now() - startTime));
        const { value, done } = await this.withTimeout(
          generator.next(),
          remaining,
          signal,
          () => new Error(`Step timeout after ${timeout}ms`),
        );

        if (done) {
          return value;
        }

        if (value.type === "chunk") {
          await this.emitEvent(workflowId, "workflow.step.yielded", {
            type: "step.yielded",
            stepId,
            data: value.data as unknown as TOutput,
          });
          logger.debug("Step yielded chunk", { stepId });
        }
      }
    } finally {
      try {
        await generator.return({ type: "complete", data: {} as TStepOutput });
      } catch {
        // Generator cleanup must not hide the original step result or error.
      }
    }
  }

  private createContext(
    workflow: Workflow<TContext, TInput, TOutput>,
    logger: Logger,
    signal: AbortSignal,
  ): WorkflowContext<TContext> {
    return {
      signal,
      workflow: {
        id: workflow.id,
        state: workflow.state,
        currentStep: workflow.currentStep,
        version: workflow.version,
      },
      data: workflow.context,
      logger,
      metrics: this.metrics,
      updateContext: (updates: Partial<TContext>) => {
        const existing = this.contextUpdates.get(workflow.id) || {};
        this.contextUpdates.set(workflow.id, { ...existing, ...updates });
      },
      appendSteps: (steps: readonly Step<TContext, unknown, unknown>[]) => {
        const existing = this.stepAppends.get(workflow.id) || [];
        this.stepAppends.set(workflow.id, [...existing, ...steps]);
      },
      abort: (reason: string, errorType: ErrorType = "permanent") => {
        this.abort(workflow.id, reason, errorType).catch((err: unknown) => {
          logger.error("Failed to abort workflow", toError(err));
        });
      },
    };
  }

  private classifyError(
    err: Error,
    step: Step<TContext, unknown, unknown>,
  ): WorkflowError {
    let errorType: ErrorType;
    try {
      errorType = step.errorClassifier
        ? step.errorClassifier(err)
        : this.defaultErrorClassifier(err);
    } catch (classifierError) {
      this.logger.warn("Step error classifier failed", {
        error: toError(classifierError).message,
      });
      errorType = "unknown";
    }

    return {
      type: errorType,
      message: err.message,
      retryable: errorType === "transient" || errorType === "timeout",
      code: (err as Error & { code?: string }).code,
      stack: err.stack,
      timestamp: Date.now(),
    };
  }

  private defaultErrorClassifier(err: Error): ErrorType {
    const message = err.message.toLowerCase();

    if (message.includes("timeout")) return "timeout";
    if (message.includes("network") || message.includes("econnrefused"))
      return "transient";
    if (message.includes("validation") || message.includes("invalid"))
      return "validation";

    return "unknown";
  }

  private isWorkflowTimedOut(
    workflow: Workflow<TContext, TInput, TOutput>,
  ): boolean {
    if (!workflow.maxExecutionTime || !workflow.executionStartedAt) {
      return false;
    }
    return Date.now() - workflow.executionStartedAt > workflow.maxExecutionTime;
  }

  private applyContextUpdates(
    workflow: Workflow<TContext, TInput, TOutput>,
  ): void {
    const updates = this.contextUpdates.get(workflow.id);
    if (updates) {
      workflow.context = { ...workflow.context, ...updates };
      this.contextUpdates.delete(workflow.id);
    }
  }

  private applyStepAppends(
    workflow: Workflow<TContext, TInput, TOutput>,
  ): void {
    const appends = this.stepAppends.get(workflow.id);
    if (appends && appends.length > 0) {
      workflow.steps.splice(workflow.currentStep + 1, 0, ...appends);
      this.stepAppends.delete(workflow.id);
    }
  }

  private async updateWorkflowState(
    workflow: Workflow<TContext, TInput, TOutput>,
    state: Workflow<TContext, TInput, TOutput>["state"],
  ): Promise<boolean> {
    workflow.state = state;
    return this.updateWorkflowWithVersion(workflow);
  }

  private async updateWorkflowWithVersion(
    workflow: Workflow<TContext, TInput, TOutput>,
  ): Promise<boolean> {
    const currentVersion = workflow.version;
    const success = await this.workflowStore.updateWorkflow(
      workflow,
      currentVersion,
    );

    if (!success) {
      this.logger.warn("Optimistic lock failed", {
        workflowId: workflow.id,
        expectedVersion: currentVersion,
      });
    }

    return success;
  }

  private async emitEvent<P extends WorkflowEventPayload<TOutput>>(
    workflowId: string,
    eventType: WorkflowEventType,
    payload: P,
    workflow?: Workflow<TContext, TInput, TOutput>,
  ): Promise<void> {
    const event: WorkflowEvent<TOutput> = {
      id: generateId("evt"),
      workflowId,
      timestamp: Date.now(),
      eventType,
      payload,
    };

    try {
      await this.eventStore.append(event);
      await this.eventBus.publish(event);
      const currentWorkflow =
        workflow ?? (await this.workflowStore.loadWorkflow(workflowId));
      const currentStep = currentWorkflow?.steps[currentWorkflow.currentStep];
      const signal = this.abortControllers.get(workflowId)?.signal;
      const hookContext = {
        name: eventType,
        timestamp: event.timestamp,
        workflowId,
        event,
        ...(currentWorkflow
          ? { workflow: snapshotWorkflow(currentWorkflow) }
          : {}),
        ...(currentStep ? { step: { ...currentStep } } : {}),
        ...(signal ? { signal } : {}),
      };
      await this.hooks.emit(hookContext);
    } catch (err) {
      this.logger.error("Failed to emit event", err as Error, {
        workflowId,
        eventType,
      });
      throw err;
    }
  }

  private async acquireWorkflowLock(workflowId: string): Promise<Lock | null> {
    const ttl = this.config.lockTTL ?? 30000;
    const lock = await this.workflowStore.acquireLock(workflowId, ttl);

    if (lock) {
      this.locks.set(workflowId, lock);
      this.lockRenewalActive.set(workflowId, true);
      this.logger.debug("Lock acquired", { workflowId, lockId: lock.id });
    }

    return lock;
  }

  private async releaseWorkflowLock(
    workflowId: string,
    lock: Lock,
  ): Promise<void> {
    this.stopLockRenewal(workflowId);
    await this.workflowStore.releaseLock(lock);
    this.locks.delete(workflowId);
    this.lockRenewalActive.delete(workflowId);
    this.logger.debug("Lock released", { workflowId, lockId: lock.id });
  }

  private startLockRenewal(workflowId: string, lock: Lock): void {
    const interval = this.config.lockRenewInterval ?? 10000;
    const ttl = this.config.lockTTL ?? 30000;

    const timer = setInterval(async () => {
      const success = await this.workflowStore.renewLock(lock, ttl);
      if (!success) {
        this.logger.error("Failed to renew lock", undefined, { workflowId });
        this.lockRenewalActive.set(workflowId, false);
        this.stopLockRenewal(workflowId);
      }
    }, interval);

    this.lockRenewTimers.set(workflowId, timer);
  }

  private stopLockRenewal(workflowId: string): void {
    const timer = this.lockRenewTimers.get(workflowId);
    if (timer) {
      clearInterval(timer);
      this.lockRenewTimers.delete(workflowId);
    }
  }

  private isAsyncGenerator<T>(
    value: Promise<T> | AsyncGenerator<T, T, unknown>,
  ): value is AsyncGenerator<T, T, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      "next" in value &&
      typeof value.next === "function"
    );
  }

  private withTimeout<T>(
    operation: Promise<T>,
    timeout: number | undefined,
    signal: AbortSignal,
    timeoutError: () => Error = () => new Error("Operation timed out"),
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(new WorkflowAborted());

    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const abortPromise = new Promise<never>((_, reject) => {
      abortHandler = () => reject(new WorkflowAborted());
      signal.addEventListener("abort", abortHandler, { once: true });
    });
    const timeoutPromise =
      timeout === undefined
        ? undefined
        : new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(timeoutError()), timeout);
          });

    const races: Promise<T>[] = [operation, abortPromise];
    if (timeoutPromise) races.push(timeoutPromise);

    return Promise.race(races).finally(() => {
      if (timer) clearTimeout(timer);
      if (abortHandler) signal.removeEventListener("abort", abortHandler);
    });
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const abortHandler = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abortHandler);
        reject(new WorkflowAborted());
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      timeout = setTimeout(() => {
        signal.removeEventListener("abort", abortHandler);
        resolve();
      }, ms);
      if (signal.aborted) abortHandler();
    });
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down workflow runner");

    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    for (const [workflowId, lock] of this.locks.entries()) {
      this.stopLockRenewal(workflowId);
      await this.workflowStore.releaseLock(lock);
    }

    this.abortControllers.clear();
    this.locks.clear();
    this.lockRenewTimers.clear();
    this.lockRenewalActive.clear();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function snapshotWorkflow<TContext, TInput, TOutput>(
  workflow: Workflow<TContext, TInput, TOutput>,
): Readonly<Workflow<TContext, TInput, TOutput>> {
  const { steps, ...serializable } = workflow;
  return Object.freeze({
    ...structuredClone(serializable),
    steps: steps.map((step) => Object.freeze({ ...step })),
  }) as Readonly<Workflow<TContext, TInput, TOutput>>;
}
