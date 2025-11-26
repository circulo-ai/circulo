/**
 * Agent entity and management
 */

import { BaseEntity, EntityState, ID, Metadata, Timestamp } from '../types/common';

/**
 * Agent capability definition
 */
export interface AgentCapability {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
    name: string;
    description?: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    capabilities?: AgentCapability[];
    tools?: ID[];
    integrations?: ID[];
    knowledgeBases?: ID[];
    metadata?: Metadata;
}

/**
 * Agent interface
 */
export interface IAgent extends BaseEntity {
    name: string;
    description?: string;
    state: EntityState;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    capabilities: AgentCapability[];
    tools: ID[];
    integrations: ID[];
    knowledgeBases: ID[];
    conversationIds: ID[];
    taskIds: ID[];
}

/**
 * Agent execution context
 */
export interface AgentContext {
    agentId: ID;
    conversationId?: ID;
    taskId?: ID;
    userId?: ID;
    variables?: Record<string, unknown>;
    metadata?: Metadata;
}

/**
 * Agent message
 */
export interface AgentMessage {
    id: ID;
    agentId: ID;
    conversationId: ID;
    role: 'agent' | 'user' | 'system';
    content: string;
    timestamp: Timestamp;
    metadata?: Metadata;
}

/**
 * Agent response
 */
export interface AgentResponse {
    message: AgentMessage;
    toolCalls?: ToolCall[];
    artifacts?: ID[];
    metadata?: Metadata;
}

/**
 * Tool call representation
 */
export interface ToolCall {
    id: ID;
    toolId: ID;
    name: string;
    parameters: Record<string, unknown>;
    result?: unknown;
    error?: string;
    timestamp: Timestamp;
}

/**
 * Agent lifecycle hooks
 */
export interface AgentLifecycleHooks {
    onCreate?(agent: IAgent): Promise<void> | void;
    onActivate?(agent: IAgent): Promise<void> | void;
    onPause?(agent: IAgent): Promise<void> | void;
    onArchive?(agent: IAgent): Promise<void> | void;
    onDelete?(agent: IAgent): Promise<void> | void;
    onMessage?(message: AgentMessage, context: AgentContext): Promise<void> | void;
    onToolCall?(toolCall: ToolCall, context: AgentContext): Promise<void> | void;
}

/**
 * Agent class implementation
 */
export class Agent implements IAgent {
    id: ID;
    name: string;
    description?: string;
    state: EntityState;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    capabilities: AgentCapability[];
    tools: ID[];
    integrations: ID[];
    knowledgeBases: ID[];
    conversationIds: ID[];
    taskIds: ID[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    constructor(config: AgentConfig, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.description = config.description;
        this.state = EntityState.CREATED;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt;
        this.temperature = config.temperature;
        this.maxTokens = config.maxTokens;
        this.capabilities = config.capabilities || [];
        this.tools = config.tools || [];
        this.integrations = config.integrations || [];
        this.knowledgeBases = config.knowledgeBases || [];
        this.conversationIds = [];
        this.taskIds = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
    }

    private generateId(): ID {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Activate the agent
     */
    activate(): void {
        this.state = EntityState.ACTIVE;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Pause the agent
     */
    pause(): void {
        this.state = EntityState.PAUSED;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Archive the agent
     */
    archive(): void {
        this.state = EntityState.ARCHIVED;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Update agent configuration
     */
    updateConfig(config: Partial<AgentConfig>): void {
        if (config.name) this.name = config.name;
        if (config.description !== undefined) this.description = config.description;
        if (config.model !== undefined) this.model = config.model;
        if (config.systemPrompt !== undefined) this.systemPrompt = config.systemPrompt;
        if (config.temperature !== undefined) this.temperature = config.temperature;
        if (config.maxTokens !== undefined) this.maxTokens = config.maxTokens;
        if (config.capabilities) this.capabilities = config.capabilities;
        if (config.tools) this.tools = config.tools;
        if (config.integrations) this.integrations = config.integrations;
        if (config.knowledgeBases) this.knowledgeBases = config.knowledgeBases;
        if (config.metadata) this.metadata = { ...this.metadata, ...config.metadata };
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Add a tool to the agent
     */
    addTool(toolId: ID): void {
        if (!this.tools.includes(toolId)) {
            this.tools.push(toolId);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Remove a tool from the agent
     */
    removeTool(toolId: ID): void {
        this.tools = this.tools.filter((id) => id !== toolId);
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Add a knowledge base to the agent
     */
    addKnowledgeBase(kbId: ID): void {
        if (!this.knowledgeBases.includes(kbId)) {
            this.knowledgeBases.push(kbId);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Remove a knowledge base from the agent
     */
    removeKnowledgeBase(kbId: ID): void {
        this.knowledgeBases = this.knowledgeBases.filter((id) => id !== kbId);
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Serialize agent to JSON
     */
    toJSON(): IAgent {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            state: this.state,
            model: this.model,
            systemPrompt: this.systemPrompt,
            temperature: this.temperature,
            maxTokens: this.maxTokens,
            capabilities: this.capabilities,
            tools: this.tools,
            integrations: this.integrations,
            knowledgeBases: this.knowledgeBases,
            conversationIds: this.conversationIds,
            taskIds: this.taskIds,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}
