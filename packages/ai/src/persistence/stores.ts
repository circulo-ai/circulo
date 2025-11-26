/**
 * Durable stores for approvals and triggers. These are lightweight wrappers that accept a Redis-like client.
 */

import { ApprovalRequest, ApprovalStore } from '../orchestration/approvals';
import { ScheduledTriggerConfig, TriggerStore, WebhookTriggerConfig } from '../orchestration/triggers';

export interface RedisLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(key: string): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
}

export class RedisApprovalStore implements ApprovalStore {
    private readonly client: RedisLike;
    private readonly prefix: string;

    constructor(client: RedisLike, prefix: string = 'ai:approvals') {
        this.client = client;
        this.prefix = prefix;
    }

    private key(id: string): string {
        return `${this.prefix}:${id}`;
    }

    async save(request: ApprovalRequest): Promise<void> {
        await this.client.set(this.key(request.id), JSON.stringify(request));
    }

    async get(requestId: string): Promise<ApprovalRequest | undefined> {
        const raw = await this.client.get(this.key(requestId));
        return raw ? (JSON.parse(raw) as ApprovalRequest) : undefined;
    }

    async findByTask(taskId: string): Promise<ApprovalRequest | undefined> {
        const keys = await this.client.keys(`${this.prefix}:*`);
        for (const key of keys) {
            const raw = await this.client.get(key);
            if (!raw) continue;
            const req = JSON.parse(raw) as ApprovalRequest;
            if (req.taskId === taskId) {
                return req;
            }
        }
        return undefined;
    }

    async update(request: ApprovalRequest): Promise<void> {
        await this.save(request);
    }
}

export class RedisTriggerStore implements TriggerStore {
    private readonly client: RedisLike;
    private readonly prefix: string;

    constructor(client: RedisLike, prefix: string = 'ai:triggers') {
        this.client = client;
        this.prefix = prefix;
    }

    private webhookKey(topic: string): string {
        return `${this.prefix}:webhook:${topic}`;
    }

    private scheduleKey(id: string): string {
        return `${this.prefix}:schedule:${id}`;
    }

    async saveWebhook(config: WebhookTriggerConfig): Promise<void> {
        await this.client.set(this.webhookKey(config.topic), JSON.stringify(config));
    }

    async saveSchedule(config: ScheduledTriggerConfig): Promise<void> {
        const id = config.id ?? `schedule_${Date.now()}`;
        await this.client.set(this.scheduleKey(id), JSON.stringify({ ...config, id }));
    }

    async listSchedules(): Promise<ScheduledTriggerConfig[]> {
        const keys = await this.client.keys(`${this.prefix}:schedule:*`);
        const configs: ScheduledTriggerConfig[] = [];
        for (const key of keys) {
            const raw = await this.client.get(key);
            if (!raw) continue;
            configs.push(JSON.parse(raw) as ScheduledTriggerConfig);
        }
        return configs;
    }

    async getWebhook(topic: string): Promise<WebhookTriggerConfig | undefined> {
        const raw = await this.client.get(this.webhookKey(topic));
        return raw ? (JSON.parse(raw) as WebhookTriggerConfig) : undefined;
    }
}
