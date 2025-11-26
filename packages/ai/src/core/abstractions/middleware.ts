/**
 * Middleware hooks that can wrap LLM calls and tool invocations.
 */

import { ChatCompletion, ChatMessage, ChatOptions } from '../types/messages';
import { ExecutionContext } from '../types/context';
import { ToolCallContext } from '../types/tools';

export interface MiddlewareHooks {
    beforePrompt?(ctx: ExecutionContext, messages: ChatMessage[], opts: ChatOptions): Promise<void> | void;
    afterPrompt?(ctx: ExecutionContext, result: ChatCompletion): Promise<void> | void;
    beforeTool?(ctx: ToolCallContext, params: unknown): Promise<void> | void;
    afterTool?(ctx: ToolCallContext, result: unknown): Promise<void> | void;
    onError?(ctx: ExecutionContext, error: unknown): Promise<void> | void;
}
