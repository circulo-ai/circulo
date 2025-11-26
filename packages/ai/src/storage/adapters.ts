/**
 * Storage adapter interfaces and implementations
 */

import { ID, PaginationParams, PaginatedResponse, QueryOptions } from '../types/common';
import { IAgent } from '../core/agent';
import { IConversation } from '../core/conversation';
import { ITask } from '../core/task';
import { ITool } from '../core/tool';
import { IIntegration } from '../core/integration';
import { IKnowledgeBase } from '../core/knowledge-base';
import { IArtifact } from '../core/artifact';

/**
 * Generic storage adapter interface
 */
export interface StorageAdapter<T> {
    /**
     * Initialize the storage
     */
    initialize(): Promise<void>;

    /**
     * Create an entity
     */
    create(entity: T): Promise<T>;

    /**
     * Get an entity by ID
     */
    get(id: ID): Promise<T | null>;

    /**
     * Update an entity
     */
    update(id: ID, updates: Partial<T>): Promise<T | null>;

    /**
     * Delete an entity
     */
    delete(id: ID): Promise<boolean>;

    /**
     * List entities with optional filtering and pagination
     */
    list(options?: QueryOptions): Promise<PaginatedResponse<T>>;

    /**
     * Find entities by filter
     */
    find(filter: Record<string, unknown>): Promise<T[]>;

    /**
     * Count entities
     */
    count(filter?: Record<string, unknown>): Promise<number>;

    /**
     * Clear all entities
     */
    clear(): Promise<void>;
}

/**
 * In-memory storage adapter implementation
 */
export class InMemoryStorageAdapter<T extends { id: ID }> implements StorageAdapter<T> {
    protected storage: Map<ID, T> = new Map();

    async initialize(): Promise<void> {
        // No-op for in-memory
    }

    async create(entity: T): Promise<T> {
        this.storage.set(entity.id, entity);
        return entity;
    }

    async get(id: ID): Promise<T | null> {
        return this.storage.get(id) || null;
    }

    async update(id: ID, updates: Partial<T>): Promise<T | null> {
        const existing = this.storage.get(id);
        if (!existing) return null;

        const updated = { ...existing, ...updates };
        this.storage.set(id, updated);
        return updated;
    }

    async delete(id: ID): Promise<boolean> {
        return this.storage.delete(id);
    }

    async list(options?: QueryOptions): Promise<PaginatedResponse<T>> {
        let items = Array.from(this.storage.values());

        // Apply filter
        if (options?.filter) {
            items = items.filter((item) => this.matchesFilter(item, options.filter!));
        }

        // Apply sort
        if (options?.sort) {
            items = this.sortItems(items, options.sort.field, options.sort.order);
        }

        const total = items.length;

        // Apply pagination
        const page = options?.pagination?.page || 1;
        const limit = options?.pagination?.limit || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedItems = items.slice(startIndex, endIndex);

        return {
            data: paginatedItems,
            total,
            page,
            limit,
            hasNext: endIndex < total,
        };
    }

    async find(filter: Record<string, unknown>): Promise<T[]> {
        const items = Array.from(this.storage.values());
        return items.filter((item) => this.matchesFilter(item, filter));
    }

    async count(filter?: Record<string, unknown>): Promise<number> {
        if (!filter) {
            return this.storage.size;
        }

        const items = await this.find(filter);
        return items.length;
    }

    async clear(): Promise<void> {
        this.storage.clear();
    }

    protected matchesFilter(item: T, filter: Record<string, unknown>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            const itemValue = (item as any)[key];

            if (itemValue === undefined) {
                return false;
            }

            if (typeof value === 'object' && value !== null) {
                // Handle nested filters
                if (!this.matchesFilter(itemValue, value as Record<string, unknown>)) {
                    return false;
                }
            } else if (itemValue !== value) {
                return false;
            }
        }

        return true;
    }

    protected sortItems(items: T[], field: string, order: 'asc' | 'desc'): T[] {
        return items.sort((a, b) => {
            const aValue = (a as any)[field];
            const bValue = (b as any)[field];

            if (aValue === bValue) return 0;

            const comparison = aValue < bValue ? -1 : 1;
            return order === 'asc' ? comparison : -comparison;
        });
    }
}

/**
 * File-based storage adapter (JSON)
 */
export class FileStorageAdapter<T extends { id: ID }> extends InMemoryStorageAdapter<T> {
    private filePath: string;
    private fs?: any;

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
    }

    async initialize(): Promise<void> {
        // In a real implementation, this would use Node.js fs module
        // For now, we keep it in-memory
        try {
            // this.fs = await import('fs/promises');
            // const data = await this.fs.readFile(this.filePath, 'utf-8');
            // const items = JSON.parse(data);
            // this.storage = new Map(items.map((item: T) => [item.id, item]));
        } catch (error) {
            // File doesn't exist or is empty, start fresh
        }
    }

    async create(entity: T): Promise<T> {
        const result = await super.create(entity);
        await this.persist();
        return result;
    }

    async update(id: ID, updates: Partial<T>): Promise<T | null> {
        const result = await super.update(id, updates);
        if (result) {
            await this.persist();
        }
        return result;
    }

    async delete(id: ID): Promise<boolean> {
        const result = await super.delete(id);
        if (result) {
            await this.persist();
        }
        return result;
    }

    async clear(): Promise<void> {
        await super.clear();
        await this.persist();
    }

    private async persist(): Promise<void> {
        // In a real implementation, this would write to file
        // try {
        //   const items = Array.from(this.storage.values());
        //   await this.fs.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
        // } catch (error) {
        //   console.error('Failed to persist to file:', error);
        // }
    }
}

/**
 * Storage manager to handle all entity types
 */
export class StorageManager {
    agents: StorageAdapter<IAgent>;
    conversations: StorageAdapter<IConversation>;
    tasks: StorageAdapter<ITask>;
    tools: StorageAdapter<ITool>;
    integrations: StorageAdapter<IIntegration>;
    knowledgeBases: StorageAdapter<IKnowledgeBase>;
    artifacts: StorageAdapter<IArtifact>;

    constructor(config?: {
        agents?: StorageAdapter<IAgent>;
        conversations?: StorageAdapter<IConversation>;
        tasks?: StorageAdapter<ITask>;
        tools?: StorageAdapter<ITool>;
        integrations?: StorageAdapter<IIntegration>;
        knowledgeBases?: StorageAdapter<IKnowledgeBase>;
        artifacts?: StorageAdapter<IArtifact>;
    }) {
        this.agents = config?.agents || new InMemoryStorageAdapter<IAgent>();
        this.conversations = config?.conversations || new InMemoryStorageAdapter<IConversation>();
        this.tasks = config?.tasks || new InMemoryStorageAdapter<ITask>();
        this.tools = config?.tools || new InMemoryStorageAdapter<ITool>();
        this.integrations = config?.integrations || new InMemoryStorageAdapter<IIntegration>();
        this.knowledgeBases = config?.knowledgeBases || new InMemoryStorageAdapter<IKnowledgeBase>();
        this.artifacts = config?.artifacts || new InMemoryStorageAdapter<IArtifact>();
    }

    async initialize(): Promise<void> {
        await Promise.all([
            this.agents.initialize(),
            this.conversations.initialize(),
            this.tasks.initialize(),
            this.tools.initialize(),
            this.integrations.initialize(),
            this.knowledgeBases.initialize(),
            this.artifacts.initialize(),
        ]);
    }

    async clearAll(): Promise<void> {
        await Promise.all([
            this.agents.clear(),
            this.conversations.clear(),
            this.tasks.clear(),
            this.tools.clear(),
            this.integrations.clear(),
            this.knowledgeBases.clear(),
            this.artifacts.clear(),
        ]);
    }
}
