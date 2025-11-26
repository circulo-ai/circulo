/**
 * Wraps a local function into a ToolAdapter with schema awareness.
 */

import { BaseToolAdapter } from '../../../core/abstractions/tool-adapter';
import { ToolSchema, ToolCallContext } from '../../../core/types/tools';

export type ToolExecutor<TParams, TResult> = (params: TParams, ctx: ToolCallContext) => Promise<TResult>;

export class SDKFunctionTool<TParams = Record<string, unknown>, TResult = unknown> extends BaseToolAdapter<TParams, TResult> {
    readonly schema: ToolSchema;
    private readonly executor: ToolExecutor<TParams, TResult>;

    constructor(schema: ToolSchema, executor: ToolExecutor<TParams, TResult>) {
        super();
        this.schema = schema;
        this.executor = executor;
    }

    async invoke(params: TParams, ctx: ToolCallContext): Promise<TResult> {
        return this.executor(params, ctx);
    }
}
