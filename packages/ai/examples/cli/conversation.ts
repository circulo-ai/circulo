/**
 * Conversation management with history
 * Place in: examples/cli/conversation.ts
 */

import { ChatMessage, ConversationRecord, MessageRecord, ID } from '../../src';
import { StorageManager } from './storage';

export class ConversationManager {
    constructor(private storage: StorageManager) {}

    async createConversation(title?: string): Promise<string> {
        const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const conversation: ConversationRecord = {
            id,
            title: title || `Conversation ${new Date().toLocaleString()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await this.storage.getConversationStore().createConversation(conversation);
        return id;
    }

    async addMessage(
        conversationId: string,
        message: ChatMessage
    ): Promise<MessageRecord> {
        const record: MessageRecord = {
            ...message,
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            conversationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await this.storage.getConversationStore().saveMessage(record);
        return record;
    }

    async getMessages(conversationId: string): Promise<MessageRecord[]> {
        return this.storage.getConversationStore().listMessages(conversationId);
    }

    async listConversations(): Promise<ConversationRecord[]> {
        const result = await this.storage.getConversationStore().listConversations();
        return result.data;
    }

    async clearHistory(conversationId: string): Promise<void> {
        // Get conversation
        const conv = await this.storage.getConversationStore().getConversation(conversationId);
        if (!conv) return;

        // Clear all messages
        const messages = await this.getMessages(conversationId);
        // Note: In a real implementation, you'd delete individual message files
        // For now, we'll just recreate the conversation
        await this.storage.getConversationStore().createConversation({
            ...conv,
            updatedAt: new Date().toISOString(),
        });
    }
}
