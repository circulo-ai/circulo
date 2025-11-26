/**
 * Human-in-the-loop approval management for gated orchestration.
 */

import { ExecutionContext } from '../core/types/context';
import { TaskSpec } from '../core/abstractions/orchestrator';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
    id: string;
    taskId: string;
    createdAt: string;
    requestedBy?: string;
    reason?: string;
    status: ApprovalStatus;
    decidedAt?: string;
    decidedBy?: string;
    metadata?: Record<string, unknown>;
}

export interface ApprovalStore {
    save(request: ApprovalRequest): Promise<void>;
    get(requestId: string): Promise<ApprovalRequest | undefined>;
    findByTask(taskId: string): Promise<ApprovalRequest | undefined>;
    update(request: ApprovalRequest): Promise<void>;
}

export class InMemoryApprovalStore implements ApprovalStore {
    private readonly data: Map<string, ApprovalRequest> = new Map();

    async save(request: ApprovalRequest): Promise<void> {
        this.data.set(request.id, request);
    }

    async get(requestId: string): Promise<ApprovalRequest | undefined> {
        return this.data.get(requestId);
    }

    async findByTask(taskId: string): Promise<ApprovalRequest | undefined> {
        return Array.from(this.data.values()).find((req) => req.taskId === taskId);
    }

    async update(request: ApprovalRequest): Promise<void> {
        this.data.set(request.id, request);
    }
}

export type ApprovalPolicy = (task: TaskSpec, ctx: ExecutionContext) => boolean;

export interface ApprovalManager {
    ensureApproval(task: TaskSpec, ctx: ExecutionContext): Promise<ApprovalRequest | null>;
    approve(requestId: string, approverId?: string): Promise<ApprovalRequest | null>;
    reject(requestId: string, approverId?: string, reason?: string): Promise<ApprovalRequest | null>;
    get(requestId: string): Promise<ApprovalRequest | undefined>;
}

/**
 * Default human approval manager that stores state via an ApprovalStore and decides
 * using a policy (defaults to opt-in via task.metadata.requiresApproval).
 */
export class HumanApprovalManager implements ApprovalManager {
    private readonly store: ApprovalStore;
    private readonly policy: ApprovalPolicy;

    constructor(policy?: ApprovalPolicy, store: ApprovalStore = new InMemoryApprovalStore()) {
        this.policy = policy ?? ((task) => Boolean(task.metadata?.requiresApproval));
        this.store = store;
    }

    async ensureApproval(task: TaskSpec, ctx: ExecutionContext): Promise<ApprovalRequest | null> {
        if (!this.policy(task, ctx)) {
            return null;
        }

        const existing = await this.store.findByTask(task.id);
        if (existing) {
            return existing;
        }

        const request: ApprovalRequest = {
            id: `approval_${task.id}_${Date.now()}`,
            taskId: task.id,
            createdAt: new Date().toISOString(),
            requestedBy: ctx.userId,
            reason: task.goal,
            status: 'pending',
            metadata: task.metadata,
        };

        await this.store.save(request);
        return request;
    }

    async approve(requestId: string, approverId?: string): Promise<ApprovalRequest | null> {
        const req = await this.store.get(requestId);
        if (!req) return null;
        req.status = 'approved';
        req.decidedAt = new Date().toISOString();
        req.decidedBy = approverId;
        await this.store.update(req);
        return req;
    }

    async reject(requestId: string, approverId?: string, reason?: string): Promise<ApprovalRequest | null> {
        const req = await this.store.get(requestId);
        if (!req) return null;
        req.status = 'rejected';
        req.decidedAt = new Date().toISOString();
        req.decidedBy = approverId;
        req.reason = reason ?? req.reason;
        await this.store.update(req);
        return req;
    }

    async get(requestId: string): Promise<ApprovalRequest | undefined> {
        return this.store.get(requestId);
    }
}
