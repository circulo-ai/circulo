import { ConversationStore, MessageRecord } from './conversation-store';
import { ChatMessage } from '../types/messages';
import { ID } from '../../types/common';

export interface HistoryPolicy {
    maxMessages?: number;
    maxAgeMs?: number;
}

export class HistoryManager {
    private readonly store: ConversationStore;
    private readonly policy: HistoryPolicy;

    constructor(store: ConversationStore, policy: HistoryPolicy = {}) {
        this.store = store;
        this.policy = policy;
    }

    async append(conversationId: ID, message: ChatMessage): Promise<MessageRecord> {
        const record: MessageRecord = {
            ...message,
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            conversationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await this.store.saveMessage(record);
        await this.truncate(conversationId);
        return record;
    }

    async list(conversationId: ID): Promise<MessageRecord[]> {
        return this.store.listMessages(conversationId);
    }

    private async truncate(conversationId: ID): Promise<void> {
        const msgs = await this.store.listMessages(conversationId);
        let filtered = msgs;

        if (this.policy.maxAgeMs) {
            const cutoff = Date.now() - this.policy.maxAgeMs;
            filtered = filtered.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
        }
        if (this.policy.maxMessages && filtered.length > this.policy.maxMessages) {
            filtered = filtered.slice(-this.policy.maxMessages);
        }
        if (filtered.length !== msgs.length) {
            // Overwrite by clearing and re-inserting filtered messages for this conversation
            const conv = await this.store.getConversation(conversationId);
            if (!conv) return;
            await this.store.clear();
            await this.store.createConversation(conv);
            for (const m of filtered) {
                await this.store.saveMessage(m);
            }
        }
    }
}
