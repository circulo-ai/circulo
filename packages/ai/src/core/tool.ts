/**
 * Tool abstractions (Integration moved to separate file)
 */

import { BaseEntity, EntityState, ID, Metadata, Timestamp } from '../types/common';

/**
 * Tool parameter definition
 */
export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    required?: boolean;
    default?: unknown;
    enum?: unknown[];
}

/**
 * Tool configuration
 */
export interface ToolConfig {
    name: string;
    description: string;
    version?: string;
    parameters?: ToolParameter[];
    returnType?: string;
    metadata?: Metadata;
}

/**
 * Tool interface
 */
export interface ITool extends BaseEntity {
    name: string;
    description: string;
    version: string;
    state: EntityState;
    parameters: ToolParameter[];
    returnType?: string;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
    toolId: ID;
    agentId?: ID;
    conversationId?: ID;
    taskId?: ID;
    userId?: ID;
    metadata?: Metadata;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    executionTime?: number;
    metadata?: Metadata;
}

/**
 * Tool executor function type
 */
export type ToolExecutor<TParams = Record<string, unknown>, TResult = unknown> = (
    params: TParams,
    context: ToolExecutionContext
) => Promise<ToolExecutionResult<TResult>>;

/**
 * Tool class implementation
 */
export class Tool implements ITool {
    id: ID;
    name: string;
    description: string;
    version: string;
    state: EntityState;
    parameters: ToolParameter[];
    returnType?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    private executor?: ToolExecutor;

    constructor(config: ToolConfig, executor?: ToolExecutor, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.description = config.description;
        this.version = config.version || '1.0.0';
        this.state = EntityState.ACTIVE;
        this.parameters = config.parameters || [];
        this.returnType = config.returnType;
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
        this.executor = executor;
    }

    private generateId(): ID {
        return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Set the tool executor function
     */
    setExecutor(executor: ToolExecutor): void {
        this.executor = executor;
    }

    /**
     * Execute the tool
     */
    async execute<TParams = Record<string, unknown>, TResult = unknown>(
        params: TParams,
        context: ToolExecutionContext
    ): Promise<ToolExecutionResult<TResult>> {
        if (!this.executor) {
            return {
                success: false,
                error: 'Tool executor not configured',
            };
        }

        const startTime = Date.now();
        try {
            const result = await this.executor(params as Record<string, unknown>, context);
            return {
                ...result,
                executionTime: Date.now() - startTime,
            } as ToolExecutionResult<TResult>;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                executionTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Validate parameters against schema
     */
    validateParameters(params: Record<string, unknown>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const param of this.parameters) {
            if (param.required && !(param.name in params)) {
                errors.push(`Missing required parameter: ${param.name}`);
            }

            if (param.name in params) {
                const value = params[param.name];
                const actualType = Array.isArray(value) ? 'array' : typeof value;

                if (actualType !== param.type && !(param.type === 'object' && actualType === 'object')) {
                    errors.push(`Parameter ${param.name} expected type ${param.type}, got ${actualType}`);
                }

                if (param.enum && !param.enum.includes(value)) {
                    errors.push(`Parameter ${param.name} must be one of: ${param.enum.join(', ')}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Serialize tool to JSON
     */
    toJSON(): ITool {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: this.version,
            state: this.state,
            parameters: this.parameters,
            returnType: this.returnType,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}
