/**
 * Integration entity - separate from Tool
 */

import { BaseEntity, EntityState, ID, Metadata, Timestamp } from '../types/common';

/**
 * Integration type
 */
export enum IntegrationType {
    API = 'api',
    DATABASE = 'database',
    WEBHOOK = 'webhook',
    MCP_SERVER = 'mcp_server',
    VERCEL_AI = 'vercel_ai',
    CUSTOM = 'custom',
}

/**
 * Integration configuration
 */
export interface IntegrationConfig {
    name: string;
    type: IntegrationType;
    description?: string;
    endpoint?: string;
    credentials?: Record<string, string>;
    settings?: Record<string, unknown>;
    metadata?: Metadata;
}

/**
 * Integration interface
 */
export interface IIntegration extends BaseEntity {
    name: string;
    type: IntegrationType;
    description?: string;
    state: EntityState;
    endpoint?: string;
    settings: Record<string, unknown>;
    toolIds: ID[];
}

/**
 * Integration class implementation
 */
export class Integration implements IIntegration {
    id: ID;
    name: string;
    type: IntegrationType;
    description?: string;
    state: EntityState;
    endpoint?: string;
    settings: Record<string, unknown>;
    toolIds: ID[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    private credentials?: Record<string, string>;

    constructor(config: IntegrationConfig, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.type = config.type;
        this.description = config.description;
        this.state = EntityState.ACTIVE;
        this.endpoint = config.endpoint;
        this.settings = config.settings || {};
        this.toolIds = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
        this.credentials = config.credentials;
    }

    private generateId(): ID {
        return `integration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add a tool to this integration
     */
    addTool(toolId: ID): void {
        if (!this.toolIds.includes(toolId)) {
            this.toolIds.push(toolId);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Remove a tool from this integration
     */
    removeTool(toolId: ID): void {
        this.toolIds = this.toolIds.filter((id) => id !== toolId);
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Update integration settings
     */
    updateSettings(settings: Record<string, unknown>): void {
        this.settings = { ...this.settings, ...settings };
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Get credentials (protected)
     */
    getCredentials(): Record<string, string> | undefined {
        return this.credentials;
    }

    /**
     * Activate the integration
     */
    activate(): void {
        this.state = EntityState.ACTIVE;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Pause the integration
     */
    pause(): void {
        this.state = EntityState.PAUSED;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Serialize integration to JSON (excludes credentials)
     */
    toJSON(): IIntegration {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            description: this.description,
            state: this.state,
            endpoint: this.endpoint,
            settings: this.settings,
            toolIds: this.toolIds,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}
