import { ConversationStore, ConversationRecord, MessageRecord } from '../core/storage/conversation-store';
import { ID, PaginatedResponse } from '../types/common';
import { RedisLike } from './stores';

export class RedisConversationStore implements ConversationStore {
    private readonly client: RedisLike;
    private readonly prefix: string;

    constructor(client: RedisLike, prefix: string = 'ai:conv') {
        this.client = client;
        this.prefix = prefix;
    }

    private convKey(id: ID): string {
        return `${this.prefix}:${id}`;
    }

    private msgKey(conversationId: ID, messageId: ID): string {
        return `${this.prefix}:${conversationId}:msg:${messageId}`;
    }

    private msgIndexKey(conversationId: ID): string {
        return `${this.prefix}:${conversationId}:msgs`;
    }

    async createConversation(conv: ConversationRecord): Promise<ConversationRecord> {
        await this.client.set(this.convKey(conv.id), JSON.stringify(conv));
        return conv;
    }

    async getConversation(id: ID): Promise<ConversationRecord | null> {
        const raw = await this.client.get(this.convKey(id));
        return raw ? (JSON.parse(raw) as ConversationRecord) : null;
    }

    async listConversations(): Promise<PaginatedResponse<ConversationRecord>> {
        const keys = await this.client.keys(`${this.prefix}:*:*`); // crude scan
        const convs: ConversationRecord[] = [];
        for (const key of keys) {
            if (key.includes(':msg:')) continue;
            const raw = await this.client.get(key);
            if (raw) convs.push(JSON.parse(raw) as ConversationRecord);
        }
        return { data: convs, total: convs.length, page: 1, limit: convs.length, hasNext: false };
    }

    async saveMessage(msg: MessageRecord): Promise<MessageRecord> {
        await this.client.set(this.msgKey(msg.conversationId, msg.id), JSON.stringify(msg));
        const indexKey = this.msgIndexKey(msg.conversationId);
        const existing = (await this.client.get(indexKey)) || '[]';
        const ids = JSON.parse(existing) as ID[];
        ids.push(msg.id);
        await this.client.set(indexKey, JSON.stringify(ids));
        return msg;
    }

    async listMessages(conversationId: ID): Promise<MessageRecord[]> {
        const indexKey = this.msgIndexKey(conversationId);
        const rawIds = (await this.client.get(indexKey)) || '[]';
        const ids = JSON.parse(rawIds) as ID[];
        const messages: MessageRecord[] = [];
        for (const id of ids) {
            const raw = await this.client.get(this.msgKey(conversationId, id));
            if (raw) messages.push(JSON.parse(raw) as MessageRecord);
        }
        return messages;
    }

    async clear(): Promise<void> {
        const keys = await this.client.keys(`${this.prefix}:*`);
        if (keys.length) {
            for (const key of keys) {
                await this.client.del(key);
            }
        }
    }
}
