/**
 * Abstract adapter for tools so they can be implemented locally or bridged from MCP.
 */

import { ToolSchema, ToolInvocationResult, ToolCallContext } from '../types/tools';

export interface ToolAdapter<TParams = unknown, TResult = unknown> {
    readonly schema: ToolSchema;
    invoke(params: TParams, ctx: ToolCallContext): Promise<TResult>;
    safeInvoke?(params: TParams, ctx: ToolCallContext): Promise<ToolInvocationResult<TResult>>;
}

export abstract class BaseToolAdapter<TParams = unknown, TResult = unknown> implements ToolAdapter<TParams, TResult> {
    abstract readonly schema: ToolSchema;

    /**
     * Execute the tool with validated parameters and context.
     */
    abstract invoke(params: TParams, ctx: ToolCallContext): Promise<TResult>;

    /**
     * Optional helper to wrap execution with timing and error shaping.
     */
    async safeInvoke(params: TParams, ctx: ToolCallContext): Promise<ToolInvocationResult<TResult>> {
        const start = Date.now();
        try {
            const result = await this.invoke(params, ctx);
            return { success: true, result, executionTimeMs: Date.now() - start };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                executionTimeMs: Date.now() - start,
            };
        }
    }
}

/**
 * Utility error for tool execution issues.
 */
export class ToolExecutionError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'ToolExecutionError';
    }
}
