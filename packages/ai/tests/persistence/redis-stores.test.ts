import { RedisApprovalStore, RedisTriggerStore, RedisLike } from '../../src/persistence/stores';

class MemoryRedis implements RedisLike {
    private data = new Map<string, string>();
    async get(key: string): Promise<string | null> {
        return this.data.get(key) ?? null;
    }
    async set(key: string, value: string): Promise<unknown> {
        this.data.set(key, value);
        return;
    }
    async del(key: string | string[]): Promise<unknown> {
        if (Array.isArray(key)) {
            key.forEach((k) => this.data.delete(k));
        } else {
            this.data.delete(key);
        }
        return;
    }
    async keys(pattern: string): Promise<string[]> {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.data.keys()).filter((k) => regex.test(k));
    }
}

describe('Redis-backed stores', () => {
    it('persists approvals', async () => {
        const client = new MemoryRedis();
        const store = new RedisApprovalStore(client, 'test:approvals');
        await store.save({
            id: 'a1',
            taskId: 't1',
            createdAt: 'now',
            status: 'pending',
        });
        const loaded = await store.get('a1');
        expect(loaded?.taskId).toBe('t1');
    });

    it('persists triggers', async () => {
        const client = new MemoryRedis();
        const store = new RedisTriggerStore(client, 'test:triggers');
        await store.saveWebhook({ topic: 'gh', toTask: () => ({ id: 't', goal: 'g' }) });
        await store.saveSchedule({ id: 's1', runAt: Date.now(), toTask: () => ({ id: 't2', goal: 'g2' }) });
        const wh = await store.getWebhook('gh');
        const schedules = await store.listSchedules();
        expect(wh?.topic).toBe('gh');
        expect(schedules.length).toBe(1);
    });
});
