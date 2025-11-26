/**
 * Anthropic adapter implementing the provider contract.
 */

import { AdapterWithCapabilities, ChatModelClient } from './base';
import { ChatCompletion, ChatMessage, ChatOptions } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

interface AnthropicUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}

interface AnthropicResult {
    completion: string;
    usage?: AnthropicUsage;
    toolCalls?: ChatCompletion['toolCalls'];
}

export class AnthropicAdapter extends AdapterWithCapabilities {
    private readonly usageEnabled: boolean;
    private readonly usageHook?: (usage: ChatCompletion['usage']) => void;

    constructor(client?: ChatModelClient, usageEnabled: boolean = true, usageHook?: (usage: ChatCompletion['usage']) => void) {
        super(
            'anthropic',
            {
                streaming: true,
                tools: true,
                embeddings: false,
                models: [],
            },
            client
        );
        this.usageEnabled = usageEnabled;
        this.usageHook = usageHook;
    }

    async chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion> {
        if (this.client?.chat) {
            const result = (await this.client.chat(messages, options, ctx)) as ChatCompletion & Partial<AnthropicResult>;
            return this.withUsage(result, result.usage);
        }
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

        return this.withUsage({
            messages: [
                ...messages,
                {
                    role: 'assistant',
                    content: `AnthropicAdapter stubbed response for model ${options.model}. Echo: ${lastUserMessage}`,
                },
            ],
            finishReason: 'stop',
            usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            },
            metadata: { requestId: ctx.requestId },
        });
    }

    async *stream(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion> {
        if (this.client?.stream) {
            for await (const chunk of this.client.stream(messages, options, ctx)) {
                const c = chunk as ChatCompletion & Partial<AnthropicResult>;
                yield this.withUsage(c, c.usage);
            }
            return;
        }
        yield await this.chat(messages, options, ctx);
    }

    private withUsage(completion: ChatCompletion, usage?: AnthropicUsage): ChatCompletion {
        if (!this.usageEnabled || !usage) return completion;
        const updated = {
            ...completion,
            usage: {
                promptTokens: usage.promptTokens ?? completion.usage?.promptTokens ?? 0,
                completionTokens: usage.completionTokens ?? completion.usage?.completionTokens ?? 0,
                totalTokens: usage.totalTokens ?? completion.usage?.totalTokens ?? 0,
                metadata: completion.usage?.metadata,
            },
        };
        this.usageHook?.(updated.usage);
        return updated;
    }
}
