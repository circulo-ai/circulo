/**
 * File-based storage implementation for all storage needs
 * Place in: examples/cli/storage.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
    ConversationStore,
    ConversationRecord,
    MessageRecord,
    InMemoryVectorStore,
    VectorStore,
    ApprovalStore,
    ApprovalRequest,
    TriggerStore,
    WebhookTriggerConfig,
    ScheduledTriggerConfig,
    ID,
    PaginatedResponse,
} from '../../src';

export class FileBasedConversationStore implements ConversationStore {
    private conversationsDir: string;
    private messagesDir: string;

    constructor(private baseDir: string) {
        this.conversationsDir = path.join(baseDir, 'conversations');
        this.messagesDir = path.join(baseDir, 'messages');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.conversationsDir, { recursive: true });
        await fs.mkdir(this.messagesDir, { recursive: true });
    }

    async createConversation(conv: ConversationRecord): Promise<ConversationRecord> {
        const filePath = path.join(this.conversationsDir, `${conv.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(conv, null, 2));

        // Create messages directory for this conversation
        const msgDir = path.join(this.messagesDir, conv.id);
        await fs.mkdir(msgDir, { recursive: true });

        return conv;
    }

    async getConversation(id: ID): Promise<ConversationRecord | null> {
        const filePath = path.join(this.conversationsDir, `${id}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async listConversations(): Promise<PaginatedResponse<ConversationRecord>> {
        const files = await fs.readdir(this.conversationsDir);
        const conversations: ConversationRecord[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await fs.readFile(path.join(this.conversationsDir, file), 'utf-8');
                conversations.push(JSON.parse(data));
            }
        }

        conversations.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return {
            data: conversations,
            total: conversations.length,
            page: 1,
            limit: conversations.length,
            hasNext: false,
        };
    }

    async saveMessage(msg: MessageRecord): Promise<MessageRecord> {
        const msgDir = path.join(this.messagesDir, msg.conversationId);
        await fs.mkdir(msgDir, { recursive: true });

        const filePath = path.join(msgDir, `${msg.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(msg, null, 2));

        // Update conversation updatedAt
        const conv = await this.getConversation(msg.conversationId);
        if (conv) {
            conv.updatedAt = msg.updatedAt;
            await this.createConversation(conv);
        }

        return msg;
    }

    async listMessages(conversationId: ID): Promise<MessageRecord[]> {
        const msgDir = path.join(this.messagesDir, conversationId);

        try {
            const files = await fs.readdir(msgDir);
            const messages: MessageRecord[] = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const data = await fs.readFile(path.join(msgDir, file), 'utf-8');
                    messages.push(JSON.parse(data));
                }
            }

            messages.sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            return messages;
        } catch {
            return [];
        }
    }

    async clear(): Promise<void> {
        await fs.rm(this.conversationsDir, { recursive: true, force: true });
        await fs.rm(this.messagesDir, { recursive: true, force: true });
        await this.initialize();
    }
}

export class FileBasedApprovalStore implements ApprovalStore {
    private approvalsDir: string;

    constructor(private baseDir: string) {
        this.approvalsDir = path.join(baseDir, 'approvals');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.approvalsDir, { recursive: true });
    }

    async save(request: ApprovalRequest): Promise<void> {
        const filePath = path.join(this.approvalsDir, `${request.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(request, null, 2));
    }

    async get(requestId: string): Promise<ApprovalRequest | undefined> {
        const filePath = path.join(this.approvalsDir, `${requestId}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return undefined;
        }
    }

    async findByTask(taskId: string): Promise<ApprovalRequest | undefined> {
        const files = await fs.readdir(this.approvalsDir);

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await fs.readFile(path.join(this.approvalsDir, file), 'utf-8');
                const request = JSON.parse(data) as ApprovalRequest;
                if (request.taskId === taskId) {
                    return request;
                }
            }
        }

        return undefined;
    }

    async update(request: ApprovalRequest): Promise<void> {
        await this.save(request);
    }
}

export class FileBasedTriggerStore implements TriggerStore {
    private webhooksDir: string;
    private schedulesDir: string;

    constructor(private baseDir: string) {
        this.webhooksDir = path.join(baseDir, 'webhooks');
        this.schedulesDir = path.join(baseDir, 'schedules');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.webhooksDir, { recursive: true });
        await fs.mkdir(this.schedulesDir, { recursive: true });
    }

    async saveWebhook(config: WebhookTriggerConfig): Promise<void> {
        const filePath = path.join(this.webhooksDir, `${config.topic}.json`);
        // Store without the function (can't serialize)
        const storable = {
            topic: config.topic,
            context: config.context,
        };
        await fs.writeFile(filePath, JSON.stringify(storable, null, 2));
    }

    async saveSchedule(config: ScheduledTriggerConfig): Promise<void> {
        const id = config.id || `schedule_${Date.now()}`;
        const filePath = path.join(this.schedulesDir, `${id}.json`);
        // Store without the function
        const storable = {
            id,
            runAt: config.runAt,
            intervalMs: config.intervalMs,
            context: config.context,
        };
        await fs.writeFile(filePath, JSON.stringify(storable, null, 2));
    }

    async listSchedules(): Promise<ScheduledTriggerConfig[]> {
        const files = await fs.readdir(this.schedulesDir);
        const schedules: ScheduledTriggerConfig[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await fs.readFile(path.join(this.schedulesDir, file), 'utf-8');
                schedules.push(JSON.parse(data));
            }
        }

        return schedules;
    }

    async getWebhook(topic: string): Promise<WebhookTriggerConfig | undefined> {
        const filePath = path.join(this.webhooksDir, `${topic}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return undefined;
        }
    }
}

export class StorageManager {
    private conversationStore: FileBasedConversationStore;
    private approvalStore: FileBasedApprovalStore;
    private triggerStore: FileBasedTriggerStore;
    private vectorStore: VectorStore;
    private statsFile: string;

    constructor(private baseDir: string) {
        this.conversationStore = new FileBasedConversationStore(baseDir);
        this.approvalStore = new FileBasedApprovalStore(baseDir);
        this.triggerStore = new FileBasedTriggerStore(baseDir);
        this.vectorStore = new InMemoryVectorStore(); // Could use file-based later
        this.statsFile = path.join(baseDir, 'stats.json');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });
        await this.conversationStore.initialize();
        await this.approvalStore.initialize();
        await this.triggerStore.initialize();

        // Initialize stats file if it doesn't exist
        try {
            await fs.access(this.statsFile);
        } catch {
            await this.saveStats({
                conversations: 0,
                messages: 0,
                tasksCompleted: 0,
                totalTokens: 0,
                storageBytes: 0,
            });
        }
    }

    getConversationStore(): FileBasedConversationStore {
        return this.conversationStore;
    }

    getApprovalStore(): FileBasedApprovalStore {
        return this.approvalStore;
    }

    getTriggerStore(): FileBasedTriggerStore {
        return this.triggerStore;
    }

    getVectorStore(): VectorStore {
        return this.vectorStore;
    }

    async getStats(): Promise<{
        conversations: number;
        messages: number;
        tasksCompleted: number;
        totalTokens: number;
        storageBytes: number;
    }> {
        try {
            const data = await fs.readFile(this.statsFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return {
                conversations: 0,
                messages: 0,
                tasksCompleted: 0,
                totalTokens: 0,
                storageBytes: 0,
            };
        }
    }

    private async saveStats(stats: any): Promise<void> {
        await fs.writeFile(this.statsFile, JSON.stringify(stats, null, 2));
    }

    async recordTokenUsage(usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    }): Promise<void> {
        const stats = await this.getStats();
        stats.totalTokens += usage.totalTokens;
        await this.saveStats(stats);
    }

    async incrementTaskCount(): Promise<void> {
        const stats = await this.getStats();
        stats.tasksCompleted += 1;
        await this.saveStats(stats);
    }

    async updateStorageSize(): Promise<void> {
        const stats = await this.getStats();
        const size = await this.calculateDirectorySize(this.baseDir);
        stats.storageBytes = size;
        await this.saveStats(stats);
    }

    private async calculateDirectorySize(dirPath: string): Promise<number> {
        let size = 0;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    size += await this.calculateDirectorySize(fullPath);
                } else {
                    const stat = await fs.stat(fullPath);
                    size += stat.size;
                }
            }
        } catch {
            // Ignore errors
        }

        return size;
    }
}
