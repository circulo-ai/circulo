import { ConsoleLogger } from "../utils/logger";
import { InMemoryMetrics } from "../utils/metrics";
import type {
  ActivityTaskPayload,
  ActivityWorkerOptions,
  TaskDisposition,
  TaskFailure,
  TaskEnvelope,
  WorkerTaskContext,
} from "../models";
import { Worker } from "../worker/worker";
import { appendHistoryEvent } from "./history-append";

/** Executes registered activities with at-least-once delivery semantics. */
export class ActivityWorker {
  private readonly worker: Worker<ActivityTaskPayload>;

  constructor(private readonly options: ActivityWorkerOptions) {
    const logger = options.logger ?? new ConsoleLogger();
    const metrics = options.metrics ?? new InMemoryMetrics();
    this.worker = new Worker<ActivityTaskPayload>({
      id: options.id,
      role: "activity",
      queues: ["*"],
      queue: options.queue,
      concurrency: options.concurrency,
      leaseDurationMs: options.leaseDurationMs,
      pollIntervalMs: options.pollIntervalMs,
      tenantId: options.tenantId,
      handler: async (task, context) =>
        this.execute(task, context, logger, metrics),
    });
  }

  get status() {
    return this.worker.status;
  }

  start(): Promise<void> {
    return this.worker.start();
  }

  stop(options?: { graceful?: boolean; timeoutMs?: number }): Promise<void> {
    return this.worker.stop(options);
  }

  private async execute(
    task: TaskEnvelope<ActivityTaskPayload>,
    workerContext: WorkerTaskContext,
    logger: import("../models").Logger,
    metrics: import("../models").MetricsCollector,
  ): Promise<TaskDisposition> {
    if (!task.workflowId || !task.runId) {
      return {
        type: "reject",
        failure: {
          message: "Activity task is missing workflow identity",
          retryable: false,
          timestamp: Date.now(),
        },
      };
    }
    const payload = task.payload;
    const definition = this.options.registry.get(
      payload.activityName,
      payload.activityVersion,
    );
    if (!definition) {
      await this.recordTerminalActivityFailure(task, payload, {
        message: `Activity ${payload.activityName}:${payload.activityVersion} is not registered`,
        retryable: false,
        timestamp: Date.now(),
      });
      await this.options.onWorkflowReady?.(task.workflowId!, task.runId!);
      return {
        type: "reject",
        failure: {
          message: `Activity ${payload.activityName}:${payload.activityVersion} is not registered`,
          retryable: false,
          timestamp: Date.now(),
        },
      };
    }

    await appendHistoryEvent(this.options.history, {
      workflowId: task.workflowId!,
      runId: task.runId!,
      eventId: `${payload.activityId}:started:${task.attempt}`,
      ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
      eventType: "activity.started",
      payload: { activityId: payload.activityId, attempt: task.attempt },
    });

    try {
      const output = await definition.run(payload.input, {
        activityId: payload.activityId,
        activityName: payload.activityName,
        workflowId: task.workflowId!,
        runId: task.runId!,
        ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
        attempt: task.attempt,
        signal: workerContext.signal,
        logger,
        metrics,
        ...(task.traceContext === undefined
          ? {}
          : { traceContext: task.traceContext }),
        heartbeat: workerContext.heartbeat,
      });
      await appendHistoryEvent(this.options.history, {
        workflowId: task.workflowId!,
        runId: task.runId!,
        eventId: `${payload.activityId}:completed`,
        ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
        eventType: "activity.completed",
        payload: { activityId: payload.activityId, output },
      });
      await this.options.onWorkflowReady?.(task.workflowId!, task.runId!);
      return { type: "acknowledge" };
    } catch (error) {
      const failure = toFailure(error);
      await appendHistoryEvent(this.options.history, {
        workflowId: task.workflowId!,
        runId: task.runId!,
        eventId: `${payload.activityId}:failed:${task.attempt}`,
        ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
        eventType: "activity.failed",
        payload: {
          activityId: payload.activityId,
          message: failure.message,
          retryable: failure.retryable && task.attempt < task.maxAttempts,
        },
      });
      if (task.attempt >= task.maxAttempts) {
        await this.options.onWorkflowReady?.(task.workflowId!, task.runId!);
      }
      return {
        type: task.attempt < task.maxAttempts ? "retry" : "reject",
        ...(task.attempt < task.maxAttempts
          ? { failure }
          : { failure: { ...failure, retryable: false } }),
      };
    }
  }

  private async recordTerminalActivityFailure(
    task: TaskEnvelope<ActivityTaskPayload>,
    payload: ActivityTaskPayload,
    failure: TaskFailure,
  ): Promise<void> {
    await appendHistoryEvent(this.options.history, {
      workflowId: task.workflowId!,
      runId: task.runId!,
      eventId: `${payload.activityId}:failed:${task.attempt}`,
      ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
      eventType: "activity.failed",
      payload: {
        activityId: payload.activityId,
        message: failure.message,
        retryable: false,
      },
    });
  }
}

function toFailure(error: unknown): TaskFailure {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    message: normalized.message,
    code: (normalized as Error & { code?: string }).code,
    retryable: true,
    timestamp: Date.now(),
  };
}
