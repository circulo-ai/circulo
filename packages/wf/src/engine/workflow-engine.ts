import type {
  HealthCheck,
  Logger,
  Workflow,
  WorkflowDefinition,
  WorkflowEngineConfig,
  WorkflowEvent,
  WorkflowFilter,
} from "../models";
import { generateId } from "../utils/id";
import { WorkflowRunner } from "./workflow-runner";

export class WorkflowEngine<TContext, TInput, TOutput> {
  private runner: WorkflowRunner<TContext, TInput, TOutput>;
  private config: WorkflowEngineConfig<TContext, TInput, TOutput>;
  private logger: Logger;
  private runningWorkflows = new Set<string>();
  private workflowQueue: string[] = [];
  private processing = false;
  private shutdownRequested = false;
  private idempotencyCache = new Map<string, string>(); // idempotencyKey -> workflowId
  private resumeTimer?: ReturnType<typeof setInterval>;
  private resumingDue = false;

  constructor(config: WorkflowEngineConfig<TContext, TInput, TOutput>) {
    this.config = config;
    this.logger = config.logger.child({ component: "WorkflowEngine" });
    this.runner = new WorkflowRunner(
      config.workflowStore,
      config.eventStore,
      config.eventBus,
      config.logger,
      config.metrics,
      {
        defaultTimeout: config.defaultTimeout,
        defaultRetries: config.defaultRetries,
        lockTTL: config.lockTTL,
        lockRenewInterval: config.lockRenewInterval,
      },
    );

    if (config.enableHealthCheck) {
      this.startHealthCheck();
    }

    if (config.enableAutoResume !== false) {
      this.startAutoResume();
    }
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

      // Check if workflow exists in store with this idempotency key
      const existingWorkflows = await this.config.workflowStore.listWorkflows({
        tags: { idempotencyKey: definition.idempotencyKey },
        limit: 1,
      });

      if (existingWorkflows.length > 0) {
        const workflowId = existingWorkflows[0]!.id;
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

    await this.config.workflowStore.saveWorkflow(workflow);
    this.config.metrics.incrementCounter("workflow.created", {
      name: definition.name,
    });

    if (definition.idempotencyKey) {
      this.idempotencyCache.set(definition.idempotencyKey, workflow.id);
    }

    this.logger.info("Workflow created", {
      workflowId: workflow.id,
      name: definition.name,
    });

    return workflow.id;
  }

  async run(
    workflowId: string,
    transform?: (output: unknown) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    if (this.shutdownRequested) {
      throw new Error("Engine is shutting down");
    }

    const maxConcurrent = this.config.maxConcurrentWorkflows ?? Infinity;

    if (this.runningWorkflows.size >= maxConcurrent) {
      this.logger.info("Max concurrent workflows reached, queuing", {
        workflowId,
        queueSize: this.workflowQueue.length,
      });
      this.workflowQueue.push(workflowId);
      this.processQueue().catch((err) => {
        this.logger.error("Queue processing error", err as Error);
      });
      return;
    }

    await this.executeWorkflow(workflowId, transform);
  }

  private async executeWorkflow(
    workflowId: string,
    transform?: (output: unknown) => TOutput | Promise<TOutput>,
  ): Promise<void> {
    this.runningWorkflows.add(workflowId);
    this.config.metrics.recordGauge(
      "workflow.active",
      this.runningWorkflows.size,
    );

    try {
      await this.runner.run(workflowId, transform);
    } catch (err) {
      this.logger.error("Workflow execution error", err as Error, {
        workflowId,
      });
      throw err;
    } finally {
      this.runningWorkflows.delete(workflowId);
      this.config.metrics.recordGauge(
        "workflow.active",
        this.runningWorkflows.size,
      );

      this.processQueue().catch((err) => {
        this.logger.error("Queue processing error", err as Error);
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
        const workflowId = this.workflowQueue.shift();
        if (workflowId) {
          this.executeWorkflow(workflowId).catch((err) => {
            this.logger.error("Queued workflow execution error", err as Error, {
              workflowId,
            });
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

  async abort(workflowId: string, reason = "Aborted by user"): Promise<void> {
    this.logger.info("Aborting workflow", { workflowId, reason });
    return this.runner.abort(workflowId, reason);
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
      this.logger.error("Health check failed", err as Error);
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
    setInterval(async () => {
      const health = await this.getHealth();
      this.config.metrics.recordGauge(
        "workflow.queue.size",
        this.workflowQueue.length,
      );
      this.config.metrics.recordGauge(
        "workflow.active",
        health.details.activeWorkflows,
      );
      this.config.metrics.recordGauge(
        "workflow.failed",
        health.details.failedWorkflows,
      );
    }, 30000);
  }

  private startAutoResume(): void {
    const interval = this.config.autoResumeIntervalMs ?? 1000;
    this.resumeTimer = setInterval(() => {
      this.resumeDueWorkflows().catch((err) => {
        this.logger.error("Auto-resume scan failed", err as Error);
      });
    }, interval);
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
            this.logger.error("Failed to auto-resume workflow", err as Error, {
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
    this.logger.info("Shutting down workflow engine", { graceful });
    this.shutdownRequested = true;
    this.stopAutoResume();

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
    this.idempotencyCache.clear();
    this.logger.info("Workflow engine shutdown complete");
  }

  get events() {
    return {
      subscribe: this.subscribe.bind(this),
      subscribeAll: this.subscribeAll.bind(this),
    };
  }

  get status() {
    return {
      runningWorkflows: this.runningWorkflows.size,
      queuedWorkflows: this.workflowQueue.length,
      shutdownRequested: this.shutdownRequested,
    };
  }
}
