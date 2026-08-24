import type {
  ClaimedTask,
  TaskDisposition,
  TaskEnvelope,
  TaskFailure,
  WorkerOptions,
  WorkerState,
  WorkerStatus,
  WorkerTaskContext,
} from "../models";
import { exponentialBackoff } from "../utils/backoff";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

/**
 * Pull-based worker with leased task ownership and at-least-once delivery.
 * Production queue adapters must implement the same operations atomically.
 */
export class Worker<TPayload = unknown> {
  private stateValue: WorkerState = "created";
  private readonly abortController = new AbortController();
  private readonly pollers = new Set<Promise<void>>();
  private readonly taskControllers = new Set<AbortController>();
  private activeTaskCount = 0;
  private completed = 0;
  private failed = 0;
  private lastTaskAtValue?: number;

  constructor(private readonly options: WorkerOptions<TPayload>) {
    if (!options.id.trim()) throw new Error("Worker id must not be empty");
    if (options.queues.length === 0) {
      throw new Error("Worker must listen to at least one queue");
    }
    if (
      !Number.isInteger(options.concurrency ?? DEFAULT_CONCURRENCY) ||
      (options.concurrency ?? DEFAULT_CONCURRENCY) < 1
    ) {
      throw new RangeError("Worker concurrency must be a positive integer");
    }
    if ((options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS) <= 0) {
      throw new RangeError("Worker lease duration must be positive");
    }
  }

  get status(): WorkerStatus {
    return {
      id: this.options.id,
      role: this.options.role,
      state: this.stateValue,
      activeTasks: this.activeTaskCount,
      completedTasks: this.completed,
      failedTasks: this.failed,
      ...(this.lastTaskAtValue === undefined
        ? {}
        : { lastTaskAt: this.lastTaskAtValue }),
    };
  }

  async start(): Promise<void> {
    if (this.stateValue === "running") return;
    if (this.stateValue !== "created") {
      throw new Error(`Worker cannot start from ${this.stateValue} state`);
    }

    this.stateValue = "running";
    const concurrency = this.options.concurrency ?? DEFAULT_CONCURRENCY;
    for (let index = 0; index < concurrency; index += 1) {
      const loop = this.pollLoop();
      this.pollers.add(loop);
      void loop.finally(() => this.pollers.delete(loop));
    }
    await Promise.resolve();
  }

  async stop(
    options: { graceful?: boolean; timeoutMs?: number } = {},
  ): Promise<void> {
    if (this.stateValue === "stopped") return;
    if (this.stateValue === "created") {
      this.stateValue = "stopped";
      return;
    }

    this.stateValue = "stopping";
    this.abortController.abort();
    if (options.graceful === false) {
      for (const controller of this.taskControllers) controller.abort();
    }
    if (options.graceful !== false) {
      const timeoutMs = options.timeoutMs ?? 30_000;
      await waitForPromises(this.pollers, timeoutMs);
    }
    this.stateValue = "stopped";
  }

  private async pollLoop(): Promise<void> {
    const pollIntervalMs =
      this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    while (!this.abortController.signal.aborted) {
      let claimed = false;
      for (const queue of this.options.queues) {
        const task = await this.options.queue.claim<TPayload>({
          queue,
          workerId: this.options.id,
          tenantId: this.options.tenantId,
          leaseDurationMs:
            this.options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
        });
        if (task) {
          claimed = true;
          await this.process(task);
          break;
        }
      }
      if (!claimed) await delay(pollIntervalMs);
    }
  }

  private async process(claimed: ClaimedTask<TPayload>): Promise<void> {
    const { task, lease } = claimed;
    this.activeTaskCount += 1;
    this.lastTaskAtValue = Date.now();
    const controller = new AbortController();
    this.taskControllers.add(controller);
    let leaseWasLost = false;
    let leaseLostReject!: (error: Error) => void;
    const leaseLost = new Promise<never>((_, reject) => {
      leaseLostReject = reject;
    });
    const heartbeatInterval = setInterval(() => {
      this.options.queue
        .heartbeat(
          task.id,
          lease.token,
          this.options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
        )
        .then((healthy) => {
          if (!healthy) {
            leaseWasLost = true;
            controller.abort();
            leaseLostReject(new Error(`Lease lost for task ${task.id}`));
          }
        })
        .catch((error: unknown) => {
          leaseWasLost = true;
          controller.abort();
          leaseLostReject(toError(error));
        });
    }, this.options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);

    const context: WorkerTaskContext = {
      workerId: this.options.id,
      role: this.options.role,
      signal: controller.signal,
      leaseLost,
      heartbeat: () =>
        this.options.queue.heartbeat(
          task.id,
          lease.token,
          this.options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
        ),
    };

    try {
      const disposition = await Promise.race([
        this.options.handler(task, context),
        leaseLost,
      ]);
      await this.commitDisposition(task, lease.token, disposition);
    } catch (error) {
      if (!leaseWasLost) {
        await this.handleFailure(task, lease.token, toFailure(error));
      }
    } finally {
      clearInterval(heartbeatInterval);
      this.taskControllers.delete(controller);
      this.activeTaskCount -= 1;
    }
  }

  private async commitDisposition(
    task: TaskEnvelope<TPayload>,
    leaseToken: string,
    disposition: TaskDisposition,
  ): Promise<void> {
    if (disposition.type === "acknowledge") {
      const acknowledged = await this.options.queue.acknowledge(
        task.id,
        leaseToken,
      );
      if (!acknowledged)
        throw new Error(`Could not acknowledge task ${task.id}`);
      this.completed += 1;
      return;
    }
    if (disposition.type === "reject") {
      const rejected = await this.options.queue.reject(
        task.id,
        leaseToken,
        disposition.failure,
      );
      if (!rejected) throw new Error(`Could not reject task ${task.id}`);
      this.failed += 1;
      return;
    }

    await this.handleFailure(
      task,
      leaseToken,
      disposition.failure ?? {
        message: "Task requested a retry",
        retryable: true,
        timestamp: Date.now(),
      },
      disposition.availableAt,
    );
  }

  private async handleFailure(
    task: TaskEnvelope<TPayload>,
    leaseToken: string,
    failure: TaskFailure,
    requestedAvailableAt?: number,
  ): Promise<void> {
    const maxAttempts = task.maxAttempts;
    if (failure.retryable && task.attempt < maxAttempts) {
      const delayMs = retryDelay(task.attempt, task.retryPolicy);
      const availableAt = requestedAvailableAt ?? Date.now() + delayMs;
      const rescheduled = await this.options.queue.reschedule(
        task.id,
        leaseToken,
        {
          availableAt,
          failure,
        },
      );
      if (!rescheduled) throw new Error(`Could not reschedule task ${task.id}`);
      return;
    }

    const rejected = await this.options.queue.reject(
      task.id,
      leaseToken,
      failure,
    );
    if (!rejected) throw new Error(`Could not reject task ${task.id}`);
    this.failed += 1;
  }
}

function retryDelay(
  attempt: number,
  policy: TaskEnvelope["retryPolicy"],
): number {
  if (!policy) return exponentialBackoff(attempt);
  const initial = policy.initialDelayMs ?? 1000;
  const maximum = policy.maxDelayMs ?? 60_000;
  const multiplier = policy.multiplier ?? 2;
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(maximum, initial * multiplier ** exponent);
  const jitter = policy.jitter ?? 0;
  if (jitter === 0) return Math.max(0, Math.round(base));
  const factor = 1 - jitter + Math.random() * jitter * 2;
  return Math.max(0, Math.round(Math.min(maximum, base * factor)));
}

async function waitForPromises(
  promises: ReadonlySet<Promise<void>>,
  timeoutMs: number,
): Promise<void> {
  if (promises.size === 0) return;
  await Promise.race([
    Promise.allSettled([...promises]).then(() => undefined),
    delay(timeoutMs),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toFailure(error: unknown): TaskFailure {
  const normalized = toError(error);
  return {
    message: normalized.message,
    code: (normalized as Error & { code?: string }).code,
    retryable: true,
    timestamp: Date.now(),
  };
}
