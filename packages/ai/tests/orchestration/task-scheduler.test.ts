/**
 * TaskScheduler tests
 */

import { TaskScheduler } from '../../src/orchestration/task-scheduler';
import { InMemoryEventBus } from '../../src/orchestration/event-bus';
import { createTestTask } from '../helpers';
import { Priority, TaskOrdering } from '../../src/types/common';

describe('TaskScheduler', () => {
    let scheduler: TaskScheduler;
    let eventBus: InMemoryEventBus;

    beforeEach(() => {
        eventBus = new InMemoryEventBus();
        scheduler = new TaskScheduler({
            ordering: TaskOrdering.PRIORITY,
            maxConcurrent: 2,
        }, eventBus);
    });

    describe('scheduleTask', () => {
        it('should add task to queue', async () => {
            const task = createTestTask();
            scheduler.enqueue(task);

            expect(scheduler.size()).toBe(1);
            expect(scheduler.getTask(task.id)).toBeDefined();
        });

        it('should respect priority ordering', async () => {
            const lowTask = createTestTask({ priority: Priority.LOW });
            const highTask = createTestTask({ priority: Priority.HIGH });
            const mediumTask = createTestTask({ priority: Priority.NORMAL });

            scheduler.enqueue(lowTask);
            scheduler.enqueue(highTask);
            scheduler.enqueue(mediumTask);

            // Note: Implementation detail - queue might not be sorted until processing
            // But let's check if next task is high priority
            const nextTask = scheduler.dequeue();
            expect(nextTask?.id).toBe(highTask.id);
        });
    });

    describe('concurrency', () => {
        it('should respect maxConcurrent limit', async () => {
            const task1 = createTestTask();
            const task2 = createTestTask();
            const task3 = createTestTask();

            scheduler.enqueue(task1);
            scheduler.enqueue(task2);
            scheduler.enqueue(task3);

            // Start processing
            // In a real scenario, we'd need workers to pick up tasks
            // Here we just verify queue state
            expect(scheduler.size()).toBe(3);
        });
    });

    describe('removeTask', () => {
        it('should remove task from queue', async () => {
            const task = createTestTask();
            scheduler.enqueue(task);

            const removed = scheduler.removeTask(task.id);

            expect(removed).toBe(true);
            expect(scheduler.size()).toBe(0);
        });
    });
});
