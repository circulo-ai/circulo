import { TaskQueue } from '../../src/orchestration/task-queue';
import { TriggerManager } from '../../src/orchestration/triggers';
import { TaskSpec } from '../../src/core/abstractions/orchestrator';

describe('TriggerManager', () => {
    it('enqueues tasks from webhook triggers', async () => {
        const handled: TaskSpec[] = [];
        const queue = new TaskQueue();
        queue.setHandler(async (task) => {
            handled.push(task);
        });
        queue.start();

        const manager = new TriggerManager(queue);
        manager.registerWebhook({
            topic: 'github.push',
            toTask: (payload) => ({
                id: `task-${payload.sha}`,
                goal: 'process push',
                input: { payload },
            }),
        });

        manager.handleWebhook('github.push', { sha: 'abc123' });
        await new Promise((resolve) => setImmediate(resolve));

        expect(handled).toHaveLength(1);
        const payload = (handled[0].input?.payload as any) || {};
        expect(payload.sha).toBe('abc123');
    });

    it('fires scheduled triggers when due', () => {
        const queue = new TaskQueue();
        const manager = new TriggerManager(queue);
        const now = Date.now();
        manager.registerSchedule({
            runAt: now - 1,
            toTask: () => ({ id: 'scheduled-1', goal: 'run later' }),
        });
        const results = manager.processSchedules(now);
        expect(results).toHaveLength(1);
        expect(queue.size()).toBe(1);
    });
});
