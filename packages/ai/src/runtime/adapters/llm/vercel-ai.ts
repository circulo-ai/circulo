/**
 * Adapter for Vercel's AI SDK compatible with Edge runtime.
 */

import { AdapterWithCapabilities, ChatModelClient } from './base';
import { ChatCompletion, ChatMessage, ChatOptions, ChatToolCall } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

export interface VercelGatewayUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}

export interface VercelGatewayResult {
    text: string;
    toolCalls?: ChatToolCall[];
    usage?: VercelGatewayUsage;
}

export interface VercelGatewayChunk extends Partial<VercelGatewayResult> {
    delta?: string;
    done?: boolean;
}

/**
 * Adapter for Vercel AI SDK / AI Gateway. Accepts a client with chat/stream methods to keep imports optional.
 */
export class VercelAIAdapter extends AdapterWithCapabilities {
    private readonly usageHook?: (usage: ChatCompletion['usage']) => void;

    constructor(client?: ChatModelClient, usageHook?: (usage: ChatCompletion['usage']) => void) {
        super(
            'vercel-ai',
            {
                streaming: true,
                tools: true,
                embeddings: false,
                models: [],
            },
            client
        );
        this.usageHook = usageHook;
    }

    async chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion> {
        if (this.client?.chat) {
            const result = (await this.client.chat(messages, options, ctx)) as ChatCompletion & Partial<VercelGatewayResult>;
            const lastContent = result.messages?.at(-1)?.content;
            const content =
                typeof result.text === 'string'
                    ? result.text
                    : typeof lastContent === 'string'
                    ? lastContent
                    : Array.isArray(lastContent)
                    ? '[multimodal]'
                    : '';
            return this.toCompletion(messages, content, result.toolCalls, result.usage, ctx);
        }
        const content = `VercelAIAdapter placeholder for model ${options.model}`;
        return this.toCompletion(messages, content, undefined, { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, ctx);
    }

    async *stream(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion> {
        if (this.client?.stream) {
            for await (const chunk of this.client.stream(messages, options, ctx)) {
                const c = chunk as ChatCompletion & Partial<VercelGatewayChunk>;
                const text = (c as any).text ?? c.delta ?? '';
                const toolCalls = (c as any).toolCalls as ChatToolCall[] | undefined;
                yield this.toCompletion(messages, text, toolCalls, (c as any).usage, ctx);
            }
            return;
        }
        yield await this.chat(messages, options, ctx);
    }

    private toCompletion(
        prior: ChatMessage[],
        content: string,
        toolCalls: ChatToolCall[] | undefined,
        usage: VercelGatewayUsage | undefined,
        ctx: ExecutionContext
    ): ChatCompletion {
        const completion: ChatCompletion = {
            messages: [...prior, { role: 'assistant', content }],
            toolCalls,
            finishReason: toolCalls?.length ? 'tool_calls' : 'stop',
            usage: usage
                ? {
                      promptTokens: usage.promptTokens ?? 0,
                      completionTokens: usage.completionTokens ?? 0,
                      totalTokens: usage.totalTokens ?? 0,
                  }
                : undefined,
            metadata: { requestId: ctx.requestId, runtime: ctx.runtime },
        };
        if (completion.usage) {
            this.usageHook?.(completion.usage);
        }
        return completion;
    }
}
