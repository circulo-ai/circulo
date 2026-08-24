import type { TaskQueueAdapter } from "../models";

export interface RecoveryWorkerOptions {
  id: string;
  queue: TaskQueueAdapter;
  intervalMs?: number | undefined;
  onError?: ((error: Error) => void | Promise<void>) | undefined;
}

export interface RecoveryWorkerStatus {
  id: string;
  running: boolean;
  reclaimedTasks: number;
  lastRunAt?: number | undefined;
}

/** Periodically reclaims expired task leases across worker processes. */
export class RecoveryWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private reclaimed = 0;
  private lastRunAt?: number;

  constructor(private readonly options: RecoveryWorkerOptions) {
    if (!options.id.trim())
      throw new Error("Recovery worker id must not be empty");
    if ((options.intervalMs ?? 5_000) <= 0) {
      throw new RangeError("Recovery worker interval must be positive");
    }
  }

  get status(): RecoveryWorkerStatus {
    return {
      id: this.options.id,
      running: this.running,
      reclaimedTasks: this.reclaimed,
      ...(this.lastRunAt === undefined ? {} : { lastRunAt: this.lastRunAt }),
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.reclaim();
    this.timer = setInterval(() => {
      void this.reclaim();
    }, this.options.intervalMs ?? 5_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
  }

  private async reclaim(): Promise<void> {
    if (!this.running) return;
    try {
      const reclaimed = await this.options.queue.reclaimExpiredLeases();
      this.reclaimed += reclaimed;
      this.lastRunAt = Date.now();
    } catch (cause) {
      await this.options.onError?.(
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
  }
}
