/**
 * Middleware pipeline to compose hooks around LLM and tool execution.
 */

import { MiddlewareHooks } from '../../core/abstractions/middleware';
import { ChatCompletion, ChatMessage, ChatOptions } from '../../core/types/messages';
import { ExecutionContext } from '../../core/types/context';
import { ToolCallContext } from '../../core/types/tools';

export class MiddlewarePipeline {
    private readonly chain: MiddlewareHooks[] = [];

    use(middleware: MiddlewareHooks): void {
        this.chain.push(middleware);
    }

    async runBeforePrompt(ctx: ExecutionContext, messages: ChatMessage[], opts: ChatOptions): Promise<void> {
        for (const mw of this.chain) {
            if (mw.beforePrompt) {
                await mw.beforePrompt(ctx, messages, opts);
            }
        }
    }

    async runAfterPrompt(ctx: ExecutionContext, result: ChatCompletion): Promise<void> {
        for (const mw of this.chain) {
            if (mw.afterPrompt) {
                await mw.afterPrompt(ctx, result);
            }
        }
    }

    async runBeforeTool(ctx: ToolCallContext, params: unknown): Promise<void> {
        for (const mw of this.chain) {
            if (mw.beforeTool) {
                await mw.beforeTool(ctx, params);
            }
        }
    }

    async runAfterTool(ctx: ToolCallContext, result: unknown): Promise<void> {
        for (const mw of this.chain) {
            if (mw.afterTool) {
                await mw.afterTool(ctx, result);
            }
        }
    }

    async runOnError(ctx: ExecutionContext, error: unknown): Promise<void> {
        for (const mw of this.chain) {
            if (mw.onError) {
                await mw.onError(ctx, error);
            }
        }
    }
}
