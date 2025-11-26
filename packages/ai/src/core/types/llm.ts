/**
 * LLM provider capabilities and options.
 */

import { Metadata } from '../../types/common';
import { ChatCompletion, ChatMessage, ChatOptions, ChatToolCall } from './messages';
import { ExecutionContext } from './context';

export interface ProviderCapability {
    streaming: boolean;
    tools: boolean;
    embeddings: boolean;
    models: string[];
    metadata?: Metadata;
}

export interface LLMProviderAdapter {
    readonly name: string;
    capabilities(): ProviderCapability;
    chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion>;
    stream?(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion>;
    embed?(texts: string[], options: { model?: string; metadata?: Metadata }, ctx: ExecutionContext): Promise<number[][]>;
}

export interface ToolCallParser {
    parse(message: ChatMessage): ChatToolCall[] | undefined;
}
