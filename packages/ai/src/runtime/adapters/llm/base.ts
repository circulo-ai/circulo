/**
 * Reusable utilities for LLM provider adapters.
 */

import { BaseLLMProviderAdapter } from '../../../core/abstractions/llm-adapter';
import { ProviderCapability } from '../../../core/types/llm';
import { ChatCompletion, ChatMessage, ChatOptions } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

export interface ChatModelClient {
    chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion>;
    stream?(
        messages: ChatMessage[],
        options: ChatOptions,
        ctx: ExecutionContext
    ): AsyncIterable<ChatCompletion>;
    embed?(
        texts: string[],
        options: { model?: string; metadata?: Record<string, unknown> },
        ctx: ExecutionContext
    ): Promise<number[][]>;
}

export type UsageHook = (usage: ChatCompletion['usage'] | undefined, context: { provider: string }) => void;

export abstract class AdapterWithCapabilities extends BaseLLMProviderAdapter {
    readonly name: string;
    protected readonly capability: ProviderCapability;
    protected readonly client?: ChatModelClient;

    constructor(name: string, capability: ProviderCapability, client?: ChatModelClient) {
        super();
        this.name = name;
        this.capability = capability;
        this.client = client;
    }

    capabilities(): ProviderCapability {
        return this.capability;
    }
}
