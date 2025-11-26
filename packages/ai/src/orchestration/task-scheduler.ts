/**
 * Task scheduler implementation with configurable ordering strategies
 */

import EventEmitter from 'eventemitter3';
import { ID, Priority, TaskOrdering } from '../types/common';
import { Task, TaskStatus } from '../core/task';
import { Event, EventBus, EventType } from '../core/event';

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
    ordering: TaskOrdering;
    maxConcurrent?: number;
    customComparator?: (a: Task, b: Task) => number;
}

/**
 * Task scheduler interface
 */
export interface ITaskScheduler {
    /**
     * Enqueue a task
     */
    enqueue(task: Task): void;

    /**
     * Dequeue the next task
     */
    dequeue(): Task | null;

    /**
     * Get queue size
     */
    size(): number;

    /**
     * Clear the queue
     */
    clear(): void;

    /**
     * Get all queued tasks
     */
    getTasks(): Task[];

    /**
     * Start processing tasks
     */
    start(): void;

    /**
     * Stop processing tasks
     */
    stop(): void;

    /**
     * Check if scheduler is running
     */
    isRunning(): boolean;
}

/**
 * Task scheduler implementation
 */
export class TaskScheduler extends EventEmitter implements ITaskScheduler {
    private queue: Task[] = [];
    private running: boolean = false;
    private processing: Set<ID> = new Set();
    private config: TaskQueueConfig;
    private eventBus?: EventBus;

    constructor(config: TaskQueueConfig, eventBus?: EventBus) {
        super();
        this.config = {
            maxConcurrent: 5,
            ...config,
        };
        this.eventBus = eventBus;
    }

    /**
     * Enqueue a task
     */
    enqueue(task: Task): void {
        if (task.status === TaskStatus.PENDING) {
            task.status = TaskStatus.QUEUED;
        }

        this.queue.push(task);
        this.sortQueue();

        this.emit('task:enqueued', task);
        this.publishEvent(EventType.TASK_CREATED, task);

        if (this.running) {
            this.processNext();
        }
    }

    /**
     * Dequeue the next task
     */
    dequeue(): Task | null {
        const task = this.queue.shift();
        if (task) {
            this.emit('task:dequeued', task);
        }
        return task || null;
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.queue.length;
    }

    /**
     * Clear the queue
     */
    clear(): void {
        this.queue = [];
        this.emit('queue:cleared');
    }

    /**
     * Get all queued tasks
     */
    getTasks(): Task[] {
        return [...this.queue];
    }

    /**
     * Start processing tasks
     */
    start(): void {
        if (!this.running) {
            this.running = true;
            this.emit('scheduler:started');
            this.processNext();
        }
    }

    /**
     * Stop processing tasks
     */
    stop(): void {
        this.running = false;
        this.emit('scheduler:stopped');
    }

    /**
     * Check if scheduler is running
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Process next available task
     */
    private async processNext(): Promise<void> {
        if (!this.running) return;

        const maxConcurrent = this.config.maxConcurrent || 5;
        while (this.running && this.processing.size < maxConcurrent && this.queue.length > 0) {
            const task = this.dequeue();
            if (task) {
                this.processing.add(task.id);
                this.executeTask(task).finally(() => {
                    this.processing.delete(task.id);
                    this.processNext();
                });
            }
        }
    }

    /**
     * Execute a task
     */
    private async executeTask(task: Task): Promise<void> {
        try {
            task.start();
            this.emit('task:started', task);
            this.publishEvent(EventType.TASK_STARTED, task);

            // Task execution would be handled by the orchestrator
            // This is a placeholder for the execution logic
            this.emit('task:executing', task);

            // Simulate task completion (in real implementation, this would be handled by agent execution)
            // For now, we just emit events
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            task.fail(errorMessage);
            this.emit('task:failed', task, error);
            this.publishEvent(EventType.TASK_FAILED, task);
        }
    }

    /**
     * Sort queue based on ordering strategy
     */
    private sortQueue(): void {
        switch (this.config.ordering) {
            case TaskOrdering.FIFO:
                // No sorting needed, natural order is FIFO
                break;

            case TaskOrdering.LIFO:
                // Reverse order for LIFO
                this.queue.reverse();
                break;

            case TaskOrdering.PRIORITY:
                this.queue.sort((a, b) => {
                    // Higher priority first
                    if (b.priority !== a.priority) {
                        return b.priority - a.priority;
                    }
                    // Then by creation time (earlier first)
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                });
                break;

            case TaskOrdering.CUSTOM:
                if (this.config.customComparator) {
                    this.queue.sort(this.config.customComparator);
                }
                break;
        }
    }

    /**
     * Publish event to event bus
     */
    private publishEvent(type: EventType, task: Task): void {
        if (this.eventBus) {
            this.eventBus.publish({
                type,
                source: 'task_scheduler',
                sourceId: task.id,
                payload: task.toJSON() as any,
            });
        }
    }

    /**
     * Get currently processing tasks
     */
    getProcessingTasks(): ID[] {
        return Array.from(this.processing);
    }

    /**
     * Get task by ID from queue
     */
    getTask(taskId: ID): Task | null {
        return this.queue.find((t) => t.id === taskId) || null;
    }

    /**
     * Remove task from queue
     */
    removeTask(taskId: ID): boolean {
        const index = this.queue.findIndex((t) => t.id === taskId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            return true;
        }
        return false;
    }
}
