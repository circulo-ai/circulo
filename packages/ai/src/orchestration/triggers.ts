/**
 * Triggers for webhook- and schedule-based task activation.
 */

import { TaskQueue } from './task-queue';
import { TaskSpec } from '../core/abstractions/orchestrator';
import { ExecutionContext } from '../core/types/context';

export type TriggerKind = 'webhook' | 'schedule' | 'manual';

export interface TriggerResult {
    task: TaskSpec;
    enqueued: boolean;
    context?: Partial<ExecutionContext>;
}

export interface WebhookTriggerConfig {
    topic: string;
    toTask: (payload: any) => TaskSpec;
    context?: Partial<ExecutionContext>;
}

export interface ScheduledTriggerConfig {
    id?: string;
    runAt: number; // epoch ms
    intervalMs?: number;
    toTask: () => TaskSpec;
    context?: Partial<ExecutionContext>;
}

export interface TriggerStore {
    saveWebhook(config: WebhookTriggerConfig): Promise<void>;
    saveSchedule(config: ScheduledTriggerConfig): Promise<void>;
    listSchedules(): Promise<ScheduledTriggerConfig[]>;
    getWebhook(topic: string): Promise<WebhookTriggerConfig | undefined>;
}

export class InMemoryTriggerStore implements TriggerStore {
    private readonly webhooks: Map<string, WebhookTriggerConfig> = new Map();
    private readonly schedules: Map<string, ScheduledTriggerConfig> = new Map();

    async saveWebhook(config: WebhookTriggerConfig): Promise<void> {
        this.webhooks.set(config.topic, config);
    }

    async saveSchedule(config: ScheduledTriggerConfig): Promise<void> {
        const id = config.id ?? `schedule_${Date.now()}`;
        this.schedules.set(id, { ...config, id });
    }

    async listSchedules(): Promise<ScheduledTriggerConfig[]> {
        return Array.from(this.schedules.values());
    }

    async getWebhook(topic: string): Promise<WebhookTriggerConfig | undefined> {
        return this.webhooks.get(topic);
    }
}

export class WebhookTrigger {
    readonly topic: string;
    private readonly toTask: (payload: any) => TaskSpec;
    private readonly queue: TaskQueue;
    private readonly context?: Partial<ExecutionContext>;

    constructor(config: WebhookTriggerConfig, queue: TaskQueue) {
        this.topic = config.topic;
        this.toTask = config.toTask;
        this.queue = queue;
        this.context = config.context;
    }

    handle(payload: any): TriggerResult {
        const task = this.toTask(payload);
        this.queue.enqueue(task);
        return { task, enqueued: true, context: this.context };
    }
}

export class ScheduledTrigger {
    readonly id: string;
    private nextRunAt: number;
    private readonly intervalMs?: number;
    private readonly toTask: () => TaskSpec;
    private readonly queue: TaskQueue;
    private readonly context?: Partial<ExecutionContext>;

    constructor(config: ScheduledTriggerConfig, queue: TaskQueue) {
        this.id = config.id ?? `schedule_${Date.now()}`;
        this.nextRunAt = config.runAt;
        this.intervalMs = config.intervalMs;
        this.toTask = config.toTask;
        this.queue = queue;
        this.context = config.context;
    }

    tick(now: number = Date.now()): TriggerResult[] {
        const results: TriggerResult[] = [];
        if (now >= this.nextRunAt) {
            const task = this.toTask();
            this.queue.enqueue(task);
            results.push({ task, enqueued: true, context: this.context });
            if (this.intervalMs) {
                this.nextRunAt = now + this.intervalMs;
            }
        }
        return results;
    }
}

/**
 * Manages webhook and scheduled triggers and enqueues tasks accordingly.
 * The host application is responsible for calling processSchedules() periodically.
 */
export class TriggerManager {
    private readonly queue: TaskQueue;
    private readonly webhooks: Map<string, WebhookTrigger> = new Map();
    private readonly schedules: Map<string, ScheduledTrigger> = new Map();
    private readonly store?: TriggerStore;

    constructor(queue: TaskQueue, store?: TriggerStore) {
        this.queue = queue;
        this.store = store;
    }

    async registerWebhook(config: WebhookTriggerConfig): Promise<WebhookTrigger> {
        const trigger = new WebhookTrigger(config, this.queue);
        this.webhooks.set(trigger.topic, trigger);
        if (this.store) {
            await this.store.saveWebhook(config);
        }
        return trigger;
    }

    async registerSchedule(config: ScheduledTriggerConfig): Promise<ScheduledTrigger> {
        const trigger = new ScheduledTrigger(config, this.queue);
        this.schedules.set(trigger.id, trigger);
        if (this.store) {
            await this.store.saveSchedule({ ...config, id: trigger.id });
        }
        return trigger;
    }

    handleWebhook(topic: string, payload: any): TriggerResult | null {
        const trigger = this.webhooks.get(topic);
        if (!trigger) return null;
        return trigger.handle(payload);
    }

    processSchedules(now: number = Date.now()): TriggerResult[] {
        const results: TriggerResult[] = [];
        for (const trigger of this.schedules.values()) {
            results.push(...trigger.tick(now));
        }
        return results;
    }

    async loadSchedulesFromStore(): Promise<void> {
        if (!this.store) return;
        const configs = await this.store.listSchedules();
        for (const config of configs) {
            if (!this.schedules.has(config.id || '')) {
                const trigger = new ScheduledTrigger(config, this.queue);
                this.schedules.set(trigger.id, trigger);
            }
        }
    }

    async getWebhookConfig(topic: string): Promise<WebhookTriggerConfig | undefined> {
        const webhook = this.webhooks.get(topic);
        if (webhook) {
            return {
                topic: webhook.topic,
                toTask: webhook['toTask'],
                context: webhook['context'],
            };
        }
        if (this.store) {
            return this.store.getWebhook(topic);
        }
        return undefined;
    }
}

/**
 * Helper to create a generic webhook handler that resolves topic/payload,
 * useful for consumer apps (e.g., Next.js API routes, express).
 */
export function createWebhookHandler(manager: TriggerManager) {
    return async function handle(topic: string, payload: any): Promise<TriggerResult | null> {
        return manager.handleWebhook(topic, payload);
    };
}

/**
 * Helper to process scheduled triggers; invoke periodically from a scheduler/cron.
 */
export function createScheduleTicker(manager: TriggerManager) {
    return async function tick(now: number = Date.now()): Promise<TriggerResult[]> {
        await manager.loadSchedulesFromStore();
        return manager.processSchedules(now);
    };
}
