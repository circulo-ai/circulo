/**
 * Main SDK client
 */

import { Orchestrator, OrchestratorConfig } from './orchestration/orchestrator';
import { TaskScheduler } from './orchestration/task-scheduler';
import { InMemoryEventBus } from './orchestration/event-bus';
import { StorageManager, InMemoryStorageAdapter, FileStorageAdapter } from './storage/adapters';
import { PluginManager } from './plugins/plugin-manager';
import { EventBus } from './core/event';
import { TaskOrdering } from './types/common';
import { Agent } from './core/agent';
import { Tool } from './core/tool';
import { Integration } from './core/integration';

/**
 * SDK client configuration
 */
export interface SDKConfig {
    storageType?: 'memory' | 'file';
    filePath?: string;
    orchestration?: OrchestratorConfig;
    taskScheduler?: {
        ordering?: TaskOrdering;
        maxConcurrent?: number;
    };
    eventBus?: {
        maxHistorySize?: number;
    };
}

/**
 * Main AI Platform SDK Client
 */
export class AISDKClient {
    public storage: StorageManager;
    public orchestrator: Orchestrator;
    public taskScheduler: TaskScheduler;
    public eventBus: EventBus;
    public pluginManager: PluginManager;

    private config: SDKConfig;
    private initialized: boolean = false;

    constructor(config: SDKConfig = {}) {
        this.config = config;

        // Initialize event bus
        this.eventBus = new InMemoryEventBus(config.eventBus?.maxHistorySize);

        // Initialize storage
        this.storage = this.createStorageManager(config);

        // Initialize task scheduler
        this.taskScheduler = new TaskScheduler(
            {
                ordering: config.taskScheduler?.ordering || TaskOrdering.PRIORITY,
                maxConcurrent: config.taskScheduler?.maxConcurrent || 5,
            },
            this.eventBus
        );

        // Initialize orchestrator
        this.orchestrator = new Orchestrator({
            ...config.orchestration,
            eventBus: this.eventBus,
            taskScheduler: this.taskScheduler,
        });

        // Initialize plugin manager
        this.pluginManager = new PluginManager({
            eventBus: this.eventBus,
            registerTool: (tool: Tool) => this.orchestrator.registerTool(tool),
            registerIntegration: (integration: Integration) => {
                // Store integration
                this.storage.integrations.create(integration.toJSON());
            },
            registerAgent: (agent: Agent) => this.orchestrator.registerAgent(agent),
            subscribeToEvents: (filter, handler) => this.eventBus.subscribe(filter, handler),
        });
    }

    /**
     * Initialize the SDK
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.storage.initialize();
        this.taskScheduler.start();
        this.initialized = true;
    }

    /**
     * Shutdown the SDK
     */
    async shutdown(): Promise<void> {
        this.taskScheduler.stop();
        await this.storage.clearAll();
        this.initialized = false;
    }

    /**
     * Check if SDK is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Create storage manager based on config
     */
    private createStorageManager(config: SDKConfig): StorageManager {
        if (config.storageType === 'file' && config.filePath) {
            return new StorageManager({
                agents: new FileStorageAdapter(`${config.filePath}/agents.json`),
                conversations: new FileStorageAdapter(`${config.filePath}/conversations.json`),
                tasks: new FileStorageAdapter(`${config.filePath}/tasks.json`),
                tools: new FileStorageAdapter(`${config.filePath}/tools.json`),
                integrations: new FileStorageAdapter(`${config.filePath}/integrations.json`),
                knowledgeBases: new FileStorageAdapter(`${config.filePath}/knowledge-bases.json`),
                artifacts: new FileStorageAdapter(`${config.filePath}/artifacts.json`),
            });
        }

        return new StorageManager();
    }
}
