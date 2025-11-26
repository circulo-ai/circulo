import { ChatMessage } from '../types/messages';
import { ID, PaginationParams, PaginatedResponse, QueryOptions } from '../../types/common';

export interface ConversationRecord {
    id: ID;
    title?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
}

export interface MessageRecord extends ChatMessage {
    id: ID;
    conversationId: ID;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationStore {
    createConversation(conv: ConversationRecord): Promise<ConversationRecord>;
    getConversation(id: ID): Promise<ConversationRecord | null>;
    listConversations(options?: QueryOptions): Promise<PaginatedResponse<ConversationRecord>>;
    saveMessage(msg: MessageRecord): Promise<MessageRecord>;
    listMessages(conversationId: ID, params?: PaginationParams): Promise<MessageRecord[]>;
    clear(): Promise<void>;
}

export class InMemoryConversationStore implements ConversationStore {
    private conversations = new Map<ID, ConversationRecord>();
    private messages = new Map<ID, MessageRecord[]>();

    async createConversation(conv: ConversationRecord): Promise<ConversationRecord> {
        this.conversations.set(conv.id, conv);
        this.messages.set(conv.id, []);
        return conv;
    }

    async getConversation(id: ID): Promise<ConversationRecord | null> {
        return this.conversations.get(id) ?? null;
    }

    async listConversations(): Promise<PaginatedResponse<ConversationRecord>> {
        const data = Array.from(this.conversations.values());
        return { data, total: data.length, page: 1, limit: data.length, hasNext: false };
    }

    async saveMessage(msg: MessageRecord): Promise<MessageRecord> {
        const arr = this.messages.get(msg.conversationId) ?? [];
        arr.push(msg);
        this.messages.set(msg.conversationId, arr);
        return msg;
    }

    async listMessages(conversationId: ID, params?: PaginationParams): Promise<MessageRecord[]> {
        const arr = this.messages.get(conversationId) ?? [];
        const page = params?.page ?? 1;
        const limit = params?.limit ?? arr.length;
        const start = (page - 1) * limit;
        return arr.slice(start, start + limit);
    }

    async clear(): Promise<void> {
        this.conversations.clear();
        this.messages.clear();
    }
}
