import { WorkflowHookManager } from "../hooks/workflow-hooks";
import type {
  ErrorType,
  HealthCheck,
  Logger,
  Workflow,
  WorkflowDefinition,
  WorkflowEngineConfig,
  WorkflowEvent,
  WorkflowFilter,
} from "../models";
import { generateId } from "../utils/id";
import { ConsoleLogger } from "../utils/logger";
import { InMemoryMetrics } from "../utils/metrics";
import { WorkflowRunner } from "./workflow-runner";

interface QueuedWorkflow<TOutput> {
  workflowId: string;
  transform?: ((output: TOutput) => TOutput | Promise<TOutput>) | undefined;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class WorkflowEngine<TContext, TInput, TOutput> {
  private runner: WorkflowRunner<TContext, TInput, TOutput>;
  private config: WorkflowEngineConfig<TContext, TInput, TOutput>;
  private logger: Logger;
  private metrics: NonNullable<
    WorkflowEngineConfig<TContext, TInput, TOutput>["metrics"]
  >;
  private readonly hookManager: WorkflowHookManager<TContext, TInput, TOutput>;
  private runningWorkflows = new Set<string>();
  /** Coalesces duplicate run requests in this process into one execution. */
  private inFlightRuns = new Map<string, Promise<void>>();
  private workflowQueue: QueuedWorkflow<TOutput>[] = [];
  private processing = false;
  private shutdownRequested = false;
  private idempotencyCache = new Map<string, string>(); // idempotencyKey -> workflowId
  private resumeTimer?: ReturnType<typeof setInterval> | undefined;
  private healthTimer?: ReturnType<typeof setInterval> | undefined;
  private resumingDue = false;
  private transforms = new Map<
    string,
    (output: TOutput) => TOutput | Promise<TOutput>
  >();

  constructor(config: WorkflowEngineConfig<TContext, TInput, TOutput>) {
    validateEngineConfig(config);
    const logger = config.logger ?? new ConsoleLogger();
    const metrics = config.metrics ?? new InMemoryMetrics();
    this.config = {
      ...config,
      logger,
      metrics,
    };
    this.logger = logger.child({ component: "WorkflowEngine" });
    this.metrics = metrics;
    this.hookManager =
      config.hooks ??
      new WorkflowHookManager<TContext, TInput, TOutput>({
        onError: (error, context) => {
          const logContext = {
            hook: context.name,
            registrationId: context.registrationId,
            ...(context.workflowId ? { workflowId: context.workflowId } : {}),
          };
          this.logger.error("Workflow hook failed", toError(error), logContext);
        },
      });
    this.runner = new WorkflowRunner(
      this.config.workflowStore,
      this.config.eventStore,
      this.config.eventBus,
      this.logger,
      this.metrics,
      {
        defaultTimeout: this.config.defaultTimeout,
        defaultRetries: this.config.defaultRetries,
        lockTTL: this.config.lockTTL,
        lockRenewInterval: this.config.lockRenewInterval,
      },
      this.hookManager,
    );

    if (this.config.enableHealthCheck) {
      this.startHealthCheck();
    }

    if (this.config.enableAutoResume !== false) {
      this.startAutoResume();
    }

    // Defer until callers have a chance to register startup listeners while
    // keeping construction synchronous for all supported runtimes.
    queueMicrotask(() => {
      void this.hookManager.emit({
        name: "engine.started",
        timestamp: Date.now(),
      });
    });
  }

  async createWorkflow(
    definition: WorkflowDefinition<TContext, TInput, TOutput>,
    input: TInput,
  ): Promise<string> {
    // Check idempotency
    if (definition.idempotencyKey) {
      const existingWorkflowId = this.idempotencyCache.get(
        definition.idempotencyKey,
      );
      if (existingWorkflowId) {
        this.logger.info("Returning existing workflow for idempotency key", {
          idempotencyKey: definition.idempotencyKey,
          workflowId: existingWorkflowId,
        });
        return existingWorkflowId;
      }

      const existingWorkflow = this.config.workflowStore
        .findWorkflowByIdempotencyKey
        ? await this.config.workflowStore.findWorkflowByIdempotencyKey(
            definition.idempotencyKey,
          )
        : (
            await this.config.workflowStore.listWorkflows({
              tags: { idempotencyKey: definition.idempotencyKey },
              limit: 1,
            })
          )[0];

      if (existingWorkflow) {
        const workflowId = existingWorkflow.id;
        this.idempotencyCache.set(definition.idempotencyKey, workflowId);
        this.logger.info(
          "Found existing workflow with idempotency key in store",
          {
            idempotencyKey: definition.idempotencyKey,
            workflowId,
          },
        );
        return workflowId;
      }
    }

    this.logger.info("Creating workflow", {
      name: definition.name,
      version: definition.version,
    });

    if (definition.validate) {
      const isValid = await definition.validate(input);
      if (!isValid) {
        this.logger.error("Workflow input validation failed", undefined, {
          name: definition.name,
        });
        throw new Error("Workflow input validation failed");
      }
    }

    const workflow: Workflow<TContext, TInput, TOutput> = {
      id: generateId("wf"),
      definitionVersion: definition.version,
      version: 0,
      state: "pending",
      steps: definition.steps,
      currentStep: 0,
      context: structuredClone(definition.initialContext),
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      maxExecutionTime:
        definition.maxExecutionTime ?? this.config.workflowTimeout,
      retryCount: 0,
      tags: {
        ...definition.tags,
        ...(definition.idempotencyKey
          ? { idempotencyKey: definition.idempotencyKey }
          : {}),
      },
      metadata: {
        ...definition.metadata,
        workflowName: definition.name,
        workflowVersion: definition.version,
        ...(definition.transform ? { hasTransform: true } : {}),
      },
    };

    try {
      await this.config.workflowStore.saveWorkflow(workflow);
    } catch (error) {
      // A unique idempotency constraint can win a race between workers. Read
      // the winner and return it instead of creating a duplicate execution.
      if (
        definition.idempotencyKey &&
        this.config.workflowStore.findWorkflowByIdempotencyKey
      ) {
        const existingWorkflow =
          await this.config.workflowStore.findWorkflowByIdempotencyKey(
            definition.idempotencyKey,
          );
        if (existingWorkflow) return existingWorkflow.id;
      }
      throw error;
    }
    if (definition.transform) {
      this.transforms.set(workflow.id, definition.transform);
    }
    this.metrics.incrementCounter("workflow.created", {
      name: definition.name,
    });

    if (definition.idempotencyKey) {
      this.idempotencyCache.set(definition.idempotencyKey, workflow.id);
    }

    await this.hookManager.emit({
      name: "workflow.created",
      timestamp: workflow.createdAt,
      workflowId: workflow.id,
      workflow: snapshotWorkflow(workflow),
      metadata: {
        workflowName: definition.name,
        workflowVersion: definition.version,
      },
    });

    this.logger.info("Workflow created", {
      workflowId: workflow.id,
      name: definition.name,
    });

    return workflow.id;
  }

  /** Create and execute a workflow in one call; returns its durable ID. */
  async createAndRun(
    definition: WorkflowDefinition<TContext, TInput, TOutput>,
    input: TInput,
    transform?: (output: TOutput) => TOutput | Promise<TOutput>,
  ): Promise<string> {
    const workflowId = await this.createWorkflow(definition, input);
    await this.run(workflowId, transform);
    return workflowId;
  }

  async run(
    workflowId: string,
    transform?: (output: TOutput) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    if (this.shutdownRequested) {
      throw new Error("Engine is shutting down");
    }

    const existingRun = this.inFlightRuns.get(workflowId);
    if (existingRun) return existingRun;

    const maxConcurrent = this.config.maxConcurrentWorkflows ?? Infinity;

    const shouldQueue = this.runningWorkflows.size >= maxConcurrent;
    const execution = shouldQueue
      ? new Promise<void>((resolve, reject) => {
          this.workflowQueue.push({
            workflowId,
            transform,
            resolve,
            reject,
          });
          this.processQueue().catch((err: unknown) => {
            this.logger.error("Queue processing error", toError(err));
          });
        })
      : this.executeWorkflow(
          workflowId,
          transform ?? this.transforms.get(workflowId),
        );

    this.inFlightRuns.set(workflowId, execution);
    void execution.then(
      () => {
        if (this.inFlightRuns.get(workflowId) === execution) {
          this.inFlightRuns.delete(workflowId);
        }
      },
      () => {
        if (this.inFlightRuns.get(workflowId) === execution) {
          this.inFlightRuns.delete(workflowId);
        }
      },
    );

    if (shouldQueue) {
      this.logger.info("Max concurrent workflows reached, queuing", {
        workflowId,
        queueSize: this.workflowQueue.length,
      });
      return execution;
    }

    await execution;
  }

  private async executeWorkflow(
    workflowId: string,
    transform?: (output: TOutput) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    this.runningWorkflows.add(workflowId);
    this.metrics.recordGauge("workflow.active", this.runningWorkflows.size);

    try {
      await this.runner.run(workflowId, transform);
    } catch (err) {
      this.logger.error("Workflow execution error", err as Error, {
        workflowId,
      });
      throw err;
    } finally {
      this.runningWorkflows.delete(workflowId);
      this.metrics.recordGauge("workflow.active", this.runningWorkflows.size);

      this.processQueue().catch((err: unknown) => {
        this.logger.error("Queue processing error", toError(err));
      });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.workflowQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const maxConcurrent = this.config.maxConcurrentWorkflows ?? Infinity;

      while (
        this.workflowQueue.length > 0 &&
        this.runningWorkflows.size < maxConcurrent &&
        !this.shutdownRequested
      ) {
        const queued = this.workflowQueue.shift();
        if (queued) {
          this.executeWorkflow(
            queued.workflowId,
            queued.transform ?? this.transforms.get(queued.workflowId),
          )
            .then(queued.resolve, queued.reject)
            .catch((err: unknown) => {
              this.logger.error(
                "Queued workflow execution error",
                toError(err),
                {
                  workflowId: queued.workflowId,
                },
              );
            });
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async pause(workflowId: string): Promise<void> {
    this.logger.info("Pausing workflow", { workflowId });
    return this.runner.pause(workflowId);
  }

  async resume(workflowId: string): Promise<void> {
    this.logger.info("Resuming workflow", { workflowId });
    return this.runner.resume(workflowId);
  }

  async abort(
    workflowId: string,
    reason = "Aborted by user",
    errorType: ErrorType = "permanent",
  ): Promise<void> {
    this.logger.info("Aborting workflow", { workflowId, reason });
    return this.runner.abort(workflowId, reason, errorType);
  }

  async getWorkflow(
    workflowId: string,
  ): Promise<Workflow<TContext, TInput, TOutput> | null> {
    return this.config.workflowStore.loadWorkflow(workflowId);
  }

  async listWorkflows(
    filter?: WorkflowFilter,
  ): Promise<Workflow<TContext, TInput, TOutput>[]> {
    return this.config.workflowStore.listWorkflows(filter);
  }

  async getEvents(
    workflowId: string,
    fromTimestamp?: number,
  ): Promise<WorkflowEvent<TOutput>[]> {
    return this.config.eventStore.list(workflowId, fromTimestamp);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.logger.info("Deleting workflow", { workflowId });

    // Remove from idempotency cache
    const workflow = await this.config.workflowStore.loadWorkflow(workflowId);
    if (workflow?.tags["idempotencyKey"]) {
      this.idempotencyCache.delete(workflow.tags["idempotencyKey"]);
    }

    await this.config.workflowStore.deleteWorkflow(workflowId);
    await this.config.eventStore.clear(workflowId);
    this.transforms.delete(workflowId);
    await this.hookManager.emit({
      name: "workflow.deleted",
      timestamp: Date.now(),
      workflowId,
      ...(workflow ? { workflow: snapshotWorkflow(workflow) } : {}),
    });
  }

  subscribe(
    workflowId: string,
    callback: (event: WorkflowEvent<TOutput>) => void | Promise<void>,
  ): () => void {
    return this.config.eventBus.subscribe(workflowId, callback);
  }

  subscribeAll(
    callback: (event: WorkflowEvent<TOutput>) => void | Promise<void>,
  ): () => void {
    return this.config.eventBus.subscribeAll(callback);
  }

  async getHealth(): Promise<HealthCheck> {
    try {
      const workflows = await this.config.workflowStore.listWorkflows();
      const activeCount = workflows.filter((w) => w.state === "running").length;
      const queuedCount = this.workflowQueue.length;
      const failedCount = workflows.filter((w) => w.state === "failed").length;

      return {
        healthy: true,
        details: {
          activeWorkflows: activeCount,
          queuedWorkflows: queuedCount,
          failedWorkflows: failedCount,
          lastCheck: Date.now(),
        },
      };
    } catch (err) {
      this.logger.error("Health check failed", toError(err));
      return {
        healthy: false,
        details: {
          activeWorkflows: 0,
          queuedWorkflows: 0,
          failedWorkflows: 0,
          lastCheck: Date.now(),
        },
      };
    }
  }

  private startHealthCheck(): void {
    this.healthTimer = setInterval(async () => {
      const health = await this.getHealth();
      this.metrics.recordGauge(
        "workflow.queue.size",
        this.workflowQueue.length,
      );
      this.metrics.recordGauge(
        "workflow.active",
        health.details.activeWorkflows,
      );
      this.metrics.recordGauge(
        "workflow.failed",
        health.details.failedWorkflows,
      );
    }, 30000);
    unref(this.healthTimer);
  }

  private startAutoResume(): void {
    const interval = this.config.autoResumeIntervalMs ?? 1000;
    this.resumeTimer = setInterval(() => {
      this.resumeDueWorkflows().catch((err) => {
        this.logger.error("Auto-resume scan failed", toError(err));
      });
    }, interval);
    unref(this.resumeTimer);
  }

  private stopAutoResume(): void {
    if (this.resumeTimer) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = undefined;
    }
  }

  async resumeDueWorkflows(): Promise<void> {
    if (this.resumingDue) return;

    this.resumingDue = true;
    try {
      const now = Date.now();
      const due = await this.config.workflowStore.listWorkflows({
        state: "paused",
        resumeBefore: now,
      });

      for (const wf of due) {
        if (wf.resumeAt !== undefined && wf.resumeAt <= now) {
          this.run(wf.id).catch((err) => {
            this.logger.error("Failed to auto-resume workflow", toError(err), {
              workflowId: wf.id,
            });
          });
        }
      }
    } finally {
      this.resumingDue = false;
    }
  }

  async shutdown(graceful = true): Promise<void> {
    if (this.shutdownRequested) return;
    this.logger.info("Shutting down workflow engine", { graceful });
    this.shutdownRequested = true;
    this.stopAutoResume();
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }

    for (const queued of this.workflowQueue.splice(0)) {
      queued.reject(new Error("Engine is shutting down"));
    }

    if (graceful) {
      const timeout = 30000;
      const startTime = Date.now();

      while (
        this.runningWorkflows.size > 0 &&
        Date.now() - startTime < timeout
      ) {
        this.logger.info("Waiting for workflows to complete", {
          remaining: this.runningWorkflows.size,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (this.runningWorkflows.size > 0) {
        this.logger.warn("Force shutting down with running workflows", {
          count: this.runningWorkflows.size,
        });
      }
    }

    await this.runner.shutdown();
    await this.hooks.emit({
      name: "engine.shutdown",
      timestamp: Date.now(),
      metadata: { graceful },
    });
    this.inFlightRuns.clear();
    this.idempotencyCache.clear();
    this.transforms.clear();
    this.logger.info("Workflow engine shutdown complete");
  }

  get events() {
    return {
      subscribe: this.subscribe.bind(this),
      subscribeAll: this.subscribeAll.bind(this),
    };
  }

  /** Lifecycle hooks for metrics, tracing, notifications, and UI adapters. */
  get lifecycle(): WorkflowHookManager<TContext, TInput, TOutput> {
    return this.hookManager;
  }

  /** Alias for integrations that treat hooks as a first-class engine API. */
  get hooks(): WorkflowHookManager<TContext, TInput, TOutput> {
    return this.hookManager;
  }

  get status() {
    return {
      runningWorkflows: this.runningWorkflows.size,
      queuedWorkflows: this.workflowQueue.length,
      shutdownRequested: this.shutdownRequested,
    };
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

function unref(timer: ReturnType<typeof setInterval>): void {
  const nodeTimer = timer as ReturnType<typeof setInterval> & {
    unref?: () => void;
  };
  nodeTimer.unref?.();
}

function validateEngineConfig<TContext, TInput, TOutput>(
  config: WorkflowEngineConfig<TContext, TInput, TOutput>,
): void {
  assertOptionalNonNegative(config.defaultTimeout, "defaultTimeout");
  assertOptionalNonNegative(config.defaultRetries, "defaultRetries");
  assertOptionalPositive(config.lockTTL, "lockTTL");
  assertOptionalPositive(config.lockRenewInterval, "lockRenewInterval");
  assertOptionalPositive(
    config.maxConcurrentWorkflows,
    "maxConcurrentWorkflows",
  );
  assertOptionalPositive(config.workflowTimeout, "workflowTimeout");
  assertOptionalPositive(config.autoResumeIntervalMs, "autoResumeIntervalMs");
}

function assertOptionalNonNegative(
  value: number | undefined,
  name: string,
): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}

function assertOptionalPositive(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new RangeError(`${name} must be a finite, positive number`);
  }
}
