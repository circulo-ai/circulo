import { InMemoryConversationStore } from '../../src/core/storage/conversation-store';
import { HistoryManager } from '../../src/core/storage/history-manager';
import { ChatMessage } from '../../src/core/types/messages';

describe('Conversation storage and history', () => {
    it('stores and truncates history', async () => {
        const store = new InMemoryConversationStore();
        const history = new HistoryManager(store, { maxMessages: 2 });

        await store.createConversation({ id: 'conv1', createdAt: 'now', updatedAt: 'now' });
        const msg: ChatMessage = { role: 'user', content: 'hello' };
        await history.append('conv1', msg);
        await history.append('conv1', { role: 'assistant', content: 'hi' });
        await history.append('conv1', { role: 'user', content: 'again' });

        const list = await history.list('conv1');
        expect(list).toHaveLength(2);
        expect(list[0].content).toBe('hi');
        expect(list[1].content).toBe('again');
    });
});
