import type {
  TaskDisposition,
  TaskEnvelope,
  TimerTaskPayload,
  TimerWorkerOptions,
} from "../models";
import { Worker } from "../worker/worker";
import { appendHistoryEvent } from "./history-append";

/** Executes durable timer tasks without keeping workflow compute occupied. */
export class TimerWorker {
  private readonly worker: Worker<TimerTaskPayload>;

  constructor(private readonly options: TimerWorkerOptions) {
    this.worker = new Worker<TimerTaskPayload>({
      id: options.id,
      role: "scheduler",
      queues: ["timer"],
      queue: options.queue,
      concurrency: options.concurrency,
      leaseDurationMs: options.leaseDurationMs,
      pollIntervalMs: options.pollIntervalMs,
      tenantId: options.tenantId,
      onError: options.onError,
      handler: (task) => this.execute(task),
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
    task: TaskEnvelope<TimerTaskPayload>,
  ): Promise<TaskDisposition> {
    if (!task.workflowId || !task.runId) {
      return {
        type: "reject",
        failure: {
          message: "Timer task is missing workflow identity",
          retryable: false,
          timestamp: Date.now(),
        },
      };
    }
    await appendHistoryEvent(this.options.history, {
      workflowId: task.workflowId,
      runId: task.runId,
      eventId: `${task.payload.timerId}:fired`,
      ...(task.tenantId === undefined ? {} : { tenantId: task.tenantId }),
      eventType: "timer.fired",
      payload: task.payload,
    });
    await this.options.onWorkflowReady?.(task.workflowId, task.runId);
    return { type: "acknowledge" };
  }
}
