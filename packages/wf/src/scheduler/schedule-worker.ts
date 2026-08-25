import type {
  ScheduleDispatch,
  ScheduleLease,
  ScheduleStore,
  ScheduleWorkerOptions,
  ScheduleWorkerStatus,
} from "../models";
import { generateId } from "../utils/id";
import { nextCronOccurrence } from "./cron";

/** Crash-safe cron scheduler using leases and explicit dispatch acknowledgement. */
export class ScheduleWorker<TInput = unknown> {
  private readonly options: Omit<ScheduleWorkerOptions, "workerId"> & {
    workerId: string;
    pollIntervalMs: number;
    leaseMs: number;
    batchSize: number;
    concurrency: number;
  };
  private poller?: Promise<void> | undefined;
  private stopping = false;
  private activeDispatches = 0;
  private lastPollAt?: number | undefined;
  private state: ScheduleWorkerStatus["state"] = "idle";

  constructor(
    private readonly store: ScheduleStore<TInput>,
    options: ScheduleWorkerOptions,
  ) {
    const workerId = options.workerId?.trim() || generateId("scheduler");
    this.options = {
      ...options,
      workerId,
      pollIntervalMs: options.pollIntervalMs ?? 1000,
      leaseMs: options.leaseMs ?? 30_000,
      batchSize: options.batchSize ?? 100,
      concurrency: options.concurrency ?? 10,
    };
    if (
      !Number.isFinite(this.options.pollIntervalMs) ||
      this.options.pollIntervalMs < 1 ||
      !Number.isFinite(this.options.leaseMs) ||
      this.options.leaseMs < 1 ||
      !Number.isInteger(this.options.batchSize) ||
      this.options.batchSize < 1 ||
      !Number.isInteger(this.options.concurrency) ||
      this.options.concurrency < 1
    ) {
      throw new RangeError("Schedule worker limits must be positive");
    }
  }

  start(): void {
    if (this.poller) return;
    this.stopping = false;
    this.state = "running";
    this.poller = this.loop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.state = "stopping";
    await this.poller;
    this.poller = undefined;
    this.state = "stopped";
  }

  getStatus(): ScheduleWorkerStatus {
    return {
      state: this.state,
      activeDispatches: this.activeDispatches,
      lastPollAt: this.lastPollAt,
    };
  }

  private async loop(): Promise<void> {
    while (!this.stopping && !this.options.signal?.aborted) {
      try {
        this.lastPollAt = Date.now();
        const leases = await this.store.listDue(
          this.lastPollAt,
          this.options.workerId,
          this.options.batchSize,
          this.options.leaseMs,
        );
        await this.dispatchLeases(leases);
        if (leases.length === 0) await wait(this.options.pollIntervalMs);
      } catch (cause) {
        await this.reportError(cause);
        await wait(this.options.pollIntervalMs);
      }
    }
  }

  private async dispatchLeases(leases: ScheduleLease<TInput>[]): Promise<void> {
    const queue = [...leases];
    const workers = Array.from(
      { length: Math.min(this.options.concurrency, queue.length) },
      async () => {
        while (queue.length > 0 && !this.stopping) {
          const lease = queue.shift();
          if (!lease) return;
          this.activeDispatches += 1;
          try {
            const dispatch: ScheduleDispatch<unknown> = {
              schedule: lease.schedule as ScheduleDispatch<unknown>["schedule"],
              scheduledFor: lease.schedule.nextRunAt,
            };
            await this.options.onDispatch(dispatch);
            const nextRunAt = nextCronOccurrence(
              lease.schedule.cron,
              lease.schedule.nextRunAt,
            );
            await this.store.acknowledge(lease, nextRunAt);
          } catch (cause) {
            await this.store.release(lease);
            await this.reportError(cause);
          } finally {
            this.activeDispatches -= 1;
          }
        }
      },
    );
    await Promise.all(workers);
  }

  private async reportError(cause: unknown): Promise<void> {
    try {
      await this.options.onError?.(
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    } catch {
      // Error reporting must never terminate the scheduler loop.
    }
  }
}

export function createScheduleWorker<TInput>(
  store: ScheduleStore<TInput>,
  options: ScheduleWorkerOptions,
): ScheduleWorker<TInput> {
  return new ScheduleWorker(store, {
    ...options,
    workerId: options.workerId,
  });
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
