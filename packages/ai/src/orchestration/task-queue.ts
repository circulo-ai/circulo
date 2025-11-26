/**
 * Minimal task queue abstraction that is edge-compatible (no timers required to start).
 */

import { TaskSpec } from '../core/abstractions/orchestrator';

export type TaskHandler = (task: TaskSpec) => Promise<void>;

export class TaskQueue {
    private readonly queue: TaskSpec[] = [];
    private running = false;
    private handler?: TaskHandler;

    setHandler(handler: TaskHandler): void {
        this.handler = handler;
    }

    enqueue(task: TaskSpec): void {
        this.queue.push(task);
        if (this.running) {
            void this.processNext();
        }
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        void this.processNext();
    }

    stop(): void {
        this.running = false;
    }

    size(): number {
        return this.queue.length;
    }

    private async processNext(): Promise<void> {
        if (!this.running || !this.handler) return;
        const task = this.queue.shift();
        if (!task) return;
        await this.handler(task);
        if (this.running) {
            await this.processNext();
        }
    }
}
