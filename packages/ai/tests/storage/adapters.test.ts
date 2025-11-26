/**
 * Storage adapters tests
 */

import { InMemoryStorageAdapter } from '../../src/storage/adapters';
import { createTestAgent } from '../helpers';

describe('InMemoryStorageAdapter', () => {
    let adapter: InMemoryStorageAdapter<any>;

    beforeEach(() => {
        adapter = new InMemoryStorageAdapter();
    });

    describe('create', () => {
        it('should store an entity', async () => {
            const agent = createTestAgent();
            const stored = await adapter.create(agent);

            expect(stored).toEqual(agent);
            const retrieved = await adapter.get(agent.id);
            expect(retrieved).toEqual(agent);
        });
    });

    describe('update', () => {
        it('should update an entity', async () => {
            const agent = createTestAgent();
            await adapter.create(agent);

            const updated = await adapter.update(agent.id, { name: 'Updated Name' });

            expect(updated?.name).toBe('Updated Name');
            const retrieved = await adapter.get(agent.id);
            expect(retrieved?.name).toBe('Updated Name');
        });

        it('should return null for non-existent entity', async () => {
            const updated = await adapter.update('non-existent', { name: 'Updated' });
            expect(updated).toBeNull();
        });
    });

    describe('delete', () => {
        it('should delete an entity', async () => {
            const agent = createTestAgent();
            await adapter.create(agent);

            const deleted = await adapter.delete(agent.id);

            expect(deleted).toBe(true);
            const retrieved = await adapter.get(agent.id);
            expect(retrieved).toBeNull();
        });
    });

    describe('list', () => {
        it('should list entities with pagination', async () => {
            for (let i = 0; i < 15; i++) {
                await adapter.create(createTestAgent({ name: `Agent ${i}` }));
            }

            const page1 = await adapter.list({ pagination: { limit: 10, page: 1 } });
            expect(page1.data).toHaveLength(10);
            expect(page1.total).toBe(15);

            const page2 = await adapter.list({ pagination: { limit: 10, page: 2 } });
            expect(page2.data).toHaveLength(5);
        });
    });

    describe('find', () => {
        it('should find entities matching filter', async () => {
            await adapter.create(createTestAgent({ name: 'Alpha' }));
            await adapter.create(createTestAgent({ name: 'Beta' }));
            await adapter.create(createTestAgent({ name: 'Alpha' }));

            const results = await adapter.find({ name: 'Alpha' });

            expect(results).toHaveLength(2);
            expect(results[0].name).toBe('Alpha');
        });
    });
});
