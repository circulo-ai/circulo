/**
 * Base class for LLM provider adapters.
 */

import { LLMProviderAdapter, ProviderCapability } from '../types/llm';
import { ChatCompletion, ChatMessage, ChatOptions } from '../types/messages';
import { ExecutionContext } from '../types/context';

export abstract class BaseLLMProviderAdapter implements LLMProviderAdapter {
    abstract readonly name: string;

    /**
        * Declare capabilities for introspection and routing.
        */
    abstract capabilities(): ProviderCapability;

    /**
        * Execute a single chat completion request.
        */
    abstract chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion>;

    /**
        * Execute a streaming chat request.
        */
    stream?(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion>;

    /**
        * Generate embeddings when supported.
        */
    embed?(texts: string[], options: { model?: string }, ctx: ExecutionContext): Promise<number[][]>;
}
