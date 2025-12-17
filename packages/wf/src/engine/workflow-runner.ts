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
  defaultTimeout?: number;
  defaultRetries?: number;
  lockTTL?: number;
  lockRenewInterval?: number;
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
  ) {}

  async run(
    workflowId: string,
    transform?: (output: unknown) => TOutput | Promise<TOutput>,
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
    if (workflow && workflow.state === "running") {
      const success = await this.updateWorkflowState(workflow, "paused");
      if (success) {
        const currentStep = workflow.steps[workflow.currentStep];
        await this.emitEvent(workflowId, "workflow.paused", {
          type: "paused",
          stepId: currentStep?.id ?? "",
        });
        this.logger.info("Workflow paused", { workflowId });
      }
    }
  }

  async resume(workflowId: string): Promise<void> {
    this.pauseFlags.delete(workflowId);
    const workflow = await this.workflowStore.loadWorkflow(workflowId);

    if (workflow && workflow.state === "paused") {
      workflow.resumeAt = undefined;
      const success = await this.updateWorkflowState(workflow, "running");
      if (success) {
        const currentStep = workflow.steps[workflow.currentStep];
        await this.emitEvent(workflowId, "workflow.resumed", {
          type: "resumed",
          stepId: currentStep?.id ?? "",
        });
        this.logger.info("Workflow resumed", { workflowId });
        await this.run(workflowId);
      }
    }
  }

  async abort(workflowId: string, reason: string): Promise<void> {
    const controller = this.abortControllers.get(workflowId);
    if (controller) {
      controller.abort();
    }

    const workflow = await this.workflowStore.loadWorkflow(workflowId);
    if (workflow) {
      workflow.state = "failed";
      workflow.error = {
        type: "permanent",
        message: reason,
        retryable: false,
        timestamp: Date.now(),
      };
      workflow.resumeAt = undefined;
      workflow.completedAt = Date.now();

      const success = await this.updateWorkflowWithVersion(workflow);
      if (success) {
        await this.emitEvent(workflowId, "workflow.failed", {
          type: "failed",
          error: workflow.error,
        });
        this.logger.info("Workflow aborted", { workflowId, reason });
      }
    }
  }

  private async executeWorkflow(
    workflow: Workflow<TContext, TInput, TOutput>,
    signal: AbortSignal,
    transform?: (output: unknown) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    const startTime = Date.now();

    if (!workflow.executionStartedAt) {
      workflow.executionStartedAt = startTime;
    }

    workflow.resumeAt = undefined;
    workflow.state = "running";
    await this.updateWorkflowWithVersion(workflow);

    if (workflow.currentStep === 0) {
      await this.emitEvent(workflow.id, "workflow.started", {
        type: "started",
        workflowId: workflow.id,
        version: workflow.version,
      });
    }

    while (workflow.currentStep < workflow.steps.length) {
      if (signal.aborted) {
        return;
      }

      if (this.pauseFlags.get(workflow.id)) {
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
      const ctx = this.createContext(workflow, stepLogger);

      try {
        const stepStartTime = Date.now();
        await this.emitEvent(workflow.id, "workflow.step.started", {
          type: "step.started",
          stepId: step.id,
          stepName: step.name,
          attempt: workflow.retryCount,
        });

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
          throw new Error(result.error.message);
        }

        const duration = Date.now() - stepStartTime;

        if (result.type === "wait") {
          if (result.data !== undefined) {
            workflow.output = result.data as TOutput;
          }

          await this.emitEvent(workflow.id, "workflow.step.completed", {
            type: "step.completed",
            stepId: step.id,
            data: (result.data ?? workflow.output) as TOutput,
            duration,
          });

          this.metrics.recordStepSuccess(step.name);
          this.metrics.recordStepDuration(step.name, duration);

          this.applyContextUpdates(workflow);
          this.applyStepAppends(workflow);

          workflow.currentStep++;
          workflow.retryCount = 0;
          workflow.state = "paused";
          workflow.resumeAt = result.until;
          await this.updateWorkflowWithVersion(workflow);

          await this.emitEvent(workflow.id, "workflow.waiting", {
            type: "waiting",
            stepId: step.id,
            resumeAt: result.until,
          });

          stepLogger.info("Step requested wait", {
            resumeAt: result.until,
            duration,
          });
          return;
        }

        workflow.output = result.data as TOutput;

        await this.emitEvent(workflow.id, "workflow.step.completed", {
          type: "step.completed",
          stepId: step.id,
          data: result.data as TOutput,
          duration,
        });

        this.metrics.recordStepSuccess(step.name);
        this.metrics.recordStepDuration(step.name, duration);

        this.applyContextUpdates(workflow);
        this.applyStepAppends(workflow);

        workflow.currentStep++;
        workflow.retryCount = 0;
        await this.updateWorkflowWithVersion(workflow);

        stepLogger.info("Step completed successfully", { duration });
      } catch (err) {
        const error = this.classifyError(err as Error, step);
        stepLogger.error("Step failed", err as Error, {
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

    await this.emitEvent(workflow.id, "workflow.completed", {
      type: "completed",
      output: workflow.output as TOutput,
      duration: totalDuration,
    });

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

    await this.emitEvent(workflow.id, "workflow.retrying", {
      type: "retrying",
      stepId: step.id,
      attempt: workflow.retryCount,
      delay,
    });

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

    await this.emitEvent(workflow.id, "workflow.failed", {
      type: "failed",
      error,
    });

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
    if (timeout) {
      const timeoutPromise = this.sleep(timeout, signal).then(() => {
        const error: WorkflowError = {
          type: "timeout",
          message: `Step timeout after ${timeout}ms`,
          retryable: true,
          timestamp: Date.now(),
        };
        return { type: "error" as const, error };
      });
      return Promise.race([promise, timeoutPromise]);
    }
    return promise;
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
          throw new Error("Workflow aborted");
        }

        if (timeout && Date.now() - startTime > timeout) {
          throw new Error(`Step timeout after ${timeout}ms`);
        }

        const { value, done } = await generator.next();

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
    } catch (err) {
      try {
        await generator.return({ type: "complete", data: {} as TStepOutput });
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  private createContext(
    workflow: Workflow<TContext, TInput, TOutput>,
    logger: Logger,
  ): WorkflowContext<TContext> {
    return {
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
      appendSteps: (steps: Step<TContext, unknown, unknown>[]) => {
        const existing = this.stepAppends.get(workflow.id) || [];
        this.stepAppends.set(workflow.id, [...existing, ...steps]);
      },
      abort: (reason: string, _errorType: ErrorType = "permanent") => {
        this.abort(workflow.id, reason).catch((err) => {
          logger.error("Failed to abort workflow", err as Error);
        });
      },
    };
  }

  private classifyError(
    err: Error,
    step: Step<TContext, unknown, unknown>,
  ): WorkflowError {
    const errorType = step.errorClassifier
      ? step.errorClassifier(err)
      : this.defaultErrorClassifier(err);

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

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
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
