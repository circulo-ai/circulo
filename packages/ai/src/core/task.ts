/**
 * Task entity and management
 */

import { BaseEntity, EntityState, ID, Metadata, Priority, Timestamp } from '../types/common';

/**
 * Task status
 */
export enum TaskStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

/**
 * Task dependency
 */
export interface TaskDependency {
    taskId: ID;
    type: 'blocks' | 'requires' | 'related';
}

/**
 * Task configuration
 */
export interface TaskConfig {
    name: string;
    description?: string;
    type?: string;
    priority?: Priority;
    assignedAgentId?: ID;
    conversationId?: ID;
    parentTaskId?: ID;
    dependencies?: TaskDependency[];
    input?: Record<string, unknown>;
    deadline?: Timestamp;
    metadata?: Metadata;
}

/**
 * Task interface
 */
export interface ITask extends BaseEntity {
    name: string;
    description?: string;
    type: string;
    status: TaskStatus;
    priority: Priority;
    assignedAgentId?: ID;
    conversationId?: ID;
    parentTaskId?: ID;
    subtaskIds: ID[];
    dependencies: TaskDependency[];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    deadline?: Timestamp;
    progress?: number;
}

/**
 * Task result
 */
export interface TaskResult {
    taskId: ID;
    status: TaskStatus;
    output?: Record<string, unknown>;
    error?: string;
    executionTime?: number;
    metadata?: Metadata;
}

/**
 * Task class implementation
 */
export class Task implements ITask {
    id: ID;
    name: string;
    description?: string;
    type: string;
    status: TaskStatus;
    priority: Priority;
    assignedAgentId?: ID;
    conversationId?: ID;
    parentTaskId?: ID;
    subtaskIds: ID[];
    dependencies: TaskDependency[];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    deadline?: Timestamp;
    progress?: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    constructor(config: TaskConfig, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.description = config.description;
        this.type = config.type || 'generic';
        this.status = TaskStatus.PENDING;
        this.priority = config.priority ?? Priority.NORMAL;
        this.assignedAgentId = config.assignedAgentId;
        this.conversationId = config.conversationId;
        this.parentTaskId = config.parentTaskId;
        this.subtaskIds = [];
        this.dependencies = config.dependencies || [];
        this.input = config.input;
        this.deadline = config.deadline;
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
    }

    private generateId(): ID {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Assign the task to an agent
     */
    assign(agentId: ID): void {
        this.assignedAgentId = agentId;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Start the task
     */
    start(): void {
        if (this.status === TaskStatus.PENDING || this.status === TaskStatus.QUEUED) {
            this.status = TaskStatus.RUNNING;
            this.startedAt = new Date().toISOString();
            this.updatedAt = this.startedAt;
        }
    }

    /**
     * Pause the task
     */
    pause(): void {
        if (this.status === TaskStatus.RUNNING) {
            this.status = TaskStatus.PAUSED;
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Resume the task
     */
    resume(): void {
        if (this.status === TaskStatus.PAUSED) {
            this.status = TaskStatus.RUNNING;
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Complete the task
     */
    complete(output?: Record<string, unknown>): void {
        this.status = TaskStatus.COMPLETED;
        this.output = output;
        this.completedAt = new Date().toISOString();
        this.updatedAt = this.completedAt;
        this.progress = 100;
    }

    /**
     * Fail the task
     */
    fail(error: string): void {
        this.status = TaskStatus.FAILED;
        this.error = error;
        this.completedAt = new Date().toISOString();
        this.updatedAt = this.completedAt;
    }

    /**
     * Cancel the task
     */
    cancel(): void {
        this.status = TaskStatus.CANCELLED;
        this.completedAt = new Date().toISOString();
        this.updatedAt = this.completedAt;
    }

    /**
     * Update progress
     */
    updateProgress(progress: number): void {
        this.progress = Math.max(0, Math.min(100, progress));
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Add a subtask
     */
    addSubtask(subtaskId: ID): void {
        if (!this.subtaskIds.includes(subtaskId)) {
            this.subtaskIds.push(subtaskId);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Add a dependency
     */
    addDependency(dependency: TaskDependency): void {
        const exists = this.dependencies.some((d) => d.taskId === dependency.taskId && d.type === dependency.type);
        if (!exists) {
            this.dependencies.push(dependency);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Check if task is ready to run (all dependencies met)
     */
    isReady(completedTaskIds: Set<ID>): boolean {
        return this.dependencies
            .filter((d) => d.type === 'blocks' || d.type === 'requires')
            .every((d) => completedTaskIds.has(d.taskId));
    }

    /**
     * Check if task is overdue
     */
    isOverdue(): boolean {
        if (!this.deadline) return false;
        return new Date(this.deadline) < new Date() && this.status !== TaskStatus.COMPLETED;
    }

    /**
     * Get execution time in milliseconds
     */
    getExecutionTime(): number | null {
        if (!this.startedAt || !this.completedAt) return null;
        return new Date(this.completedAt).getTime() - new Date(this.startedAt).getTime();
    }

    /**
     * Serialize task to JSON
     */
    toJSON(): ITask {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            status: this.status,
            priority: this.priority,
            assignedAgentId: this.assignedAgentId,
            conversationId: this.conversationId,
            parentTaskId: this.parentTaskId,
            subtaskIds: this.subtaskIds,
            dependencies: this.dependencies,
            input: this.input,
            output: this.output,
            error: this.error,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            deadline: this.deadline,
            progress: this.progress,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}
