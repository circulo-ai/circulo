/**
 * Task scheduler with cron support
 * Place in: examples/cli/scheduler.ts
 */

import { CronJob } from 'cron';
import { StorageManager } from './storage';

interface ScheduledTask {
    id: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    cron?: string;
    at?: string;
    intervalMs?: number;
    nextRun?: number;
    agentId?: string;
    createdAt: string;
    lastRun?: string;
}

export class SchedulerManager {
    private tasks = new Map<string, ScheduledTask>();
    private jobs = new Map<string, CronJob | NodeJS.Timeout>();

    constructor(private storage: StorageManager) {}

    async schedule(params: {
        description: string;
        cron?: string;
        at?: string;
        intervalMs?: number;
        agentId?: string;
    }): Promise<string> {
        const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const task: ScheduledTask = {
            id,
            description: params.description,
            status: 'pending',
            cron: params.cron,
            at: params.at,
            intervalMs: params.intervalMs,
            agentId: params.agentId,
            createdAt: new Date().toISOString(),
        };

        // Calculate next run
        if (params.at) {
            task.nextRun = new Date(params.at).getTime();
        } else if (params.intervalMs) {
            task.nextRun = Date.now() + params.intervalMs;
        }

        this.tasks.set(id, task);

        // Setup execution
        if (params.cron) {
            this.scheduleCron(id, params.cron);
        } else if (params.at) {
            this.scheduleOneTime(id, new Date(params.at));
        } else if (params.intervalMs) {
            this.scheduleInterval(id, params.intervalMs);
        }

        return id;
    }

    private scheduleCron(taskId: string, cronExpression: string): void {
        const job = new CronJob(cronExpression, () => {
            this.executeTask(taskId);
        });

        job.start();
        this.jobs.set(taskId, job);
    }

    private scheduleOneTime(taskId: string, runAt: Date): void {
        const delay = runAt.getTime() - Date.now();

        if (delay <= 0) {
            this.executeTask(taskId);
            return;
        }

        const timeout = setTimeout(() => {
            this.executeTask(taskId);
        }, delay);

        this.jobs.set(taskId, timeout);
    }

    private scheduleInterval(taskId: string, intervalMs: number): void {
        const interval = setInterval(() => {
            this.executeTask(taskId);
        }, intervalMs);

        this.jobs.set(taskId, interval);
    }

    private async executeTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.status = 'running';
        task.lastRun = new Date().toISOString();

        console.log(`Executing scheduled task: ${task.description}`);

        try {
            // In a real implementation, this would trigger the orchestrator
            // For now, just mark as completed
            task.status = 'completed';

            // Update next run for interval tasks
            if (task.intervalMs) {
                task.nextRun = Date.now() + task.intervalMs;
            }
        } catch (error) {
            task.status = 'failed';
            console.error(`Task ${taskId} failed:`, error);
        }

        this.tasks.set(taskId, task);
    }

    async listTasks(): Promise<ScheduledTask[]> {
        return Array.from(this.tasks.values());
    }

    async cancelTask(taskId: string): Promise<void> {
        const job = this.jobs.get(taskId);

        if (job) {
            if ('stop' in job) {
                job.stop();
            } else {
                clearTimeout(job as NodeJS.Timeout);
                clearInterval(job as NodeJS.Timeout);
            }

            this.jobs.delete(taskId);
        }

        this.tasks.delete(taskId);
    }

    async stop(): Promise<void> {
        for (const [taskId, job] of this.jobs.entries()) {
            if ('stop' in job) {
                job.stop();
            } else {
                clearTimeout(job as NodeJS.Timeout);
                clearInterval(job as NodeJS.Timeout);
            }
        }

        this.jobs.clear();
    }
}
