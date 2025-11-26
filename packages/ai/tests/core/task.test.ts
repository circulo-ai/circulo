/**
 * Task class tests
 */

import { Task, TaskStatus } from '../../src/core/task';
import { Priority } from '../../src/types/common';
import { createTestTask } from '../helpers';

describe('Task', () => {
    describe('constructor', () => {
        it('should create a task with valid configuration', () => {
            const task = createTestTask();

            expect(task.name).toBe('Test Task');
            expect(task.status).toBe(TaskStatus.PENDING);
            expect(task.priority).toBe(Priority.NORMAL);
            expect(task.subtaskIds).toEqual([]);
            expect(task.dependencies).toEqual([]);
            expect(task.id).toBeDefined();
        });

        it('should use provided priority', () => {
            const task = createTestTask({ priority: Priority.HIGH });

            expect(task.priority).toBe(Priority.HIGH);
        });

        it('should initialize with assigned agent if provided', () => {
            const task = createTestTask({ assignedAgentId: 'agent-1' });

            expect(task.assignedAgentId).toBe('agent-1');
        });
    });

    describe('start', () => {
        it('should transition task to RUNNING', () => {
            const task = createTestTask();

            task.start();

            expect(task.status).toBe(TaskStatus.RUNNING);
            expect(task.startedAt).toBeDefined();
        });

        it('should not start if already completed', () => {
            const task = createTestTask();
            task.complete({ success: true });

            task.start(); // Should do nothing

            expect(task.status).toBe(TaskStatus.COMPLETED);
        });
    });

    describe('complete', () => {
        it('should transition task to COMPLETED', () => {
            const task = createTestTask();
            task.start();

            const result = { success: true, output: 'done' };
            task.complete(result);

            expect(task.status).toBe(TaskStatus.COMPLETED);
            expect(task.completedAt).toBeDefined();
            expect(task.output).toEqual(result);
        });
    });

    describe('fail', () => {
        it('should transition task to FAILED', () => {
            const task = createTestTask();
            task.start();

            const error = 'Task failed';
            task.fail(error);

            expect(task.status).toBe(TaskStatus.FAILED);
            expect(task.error).toBeDefined();
            expect(task.error).toBe('Task failed');
        });
    });

    describe('addSubtask', () => {
        it('should add a subtask ID', () => {
            const task = createTestTask();
            const subtaskId = 'task-sub-1';

            task.addSubtask(subtaskId);

            expect(task.subtaskIds).toContain(subtaskId);
        });
    });

    describe('addDependency', () => {
        it('should add a dependency', () => {
            const task = createTestTask();
            const dependency = { taskId: 'task-dep-1', type: 'requires' as const };

            task.addDependency(dependency);

            expect(task.dependencies).toContainEqual(dependency);
        });
    });

    describe('assign', () => {
        it('should assign task to an agent', () => {
            const task = createTestTask();
            const agentId = 'agent-1';

            task.assign(agentId);

            expect(task.assignedAgentId).toBe(agentId);
        });
    });

    describe('toJSON', () => {
        it('should serialize task to JSON', () => {
            const task = createTestTask();
            const json = task.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('status');
            expect(json).toHaveProperty('priority');
            expect(json).toHaveProperty('dependencies');
        });
    });
});
