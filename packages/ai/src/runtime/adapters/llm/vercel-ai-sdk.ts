/**
 * Thin wrapper to wire the Vercel AI SDK client (streamText/generateText) into our adapter interface.
 * The AI SDK dependency remains optional; pass in the client object at runtime to avoid hard coupling.
 */

import { AdapterWithCapabilities, ChatModelClient } from './base';
import { ChatCompletion, ChatMessage, ChatOptions, ChatToolCall } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

export type StreamTextFn = (params: { messages: ChatMessage[]; model: string; temperature?: number; maxTokens?: number }) => {
    toAIStreamResponse: () => AsyncIterable<{ text: string; toolCalls?: ChatToolCall[]; usage?: any }>;
};

export type GenerateTextFn = (params: { messages: ChatMessage[]; model: string; temperature?: number; maxTokens?: number }) => Promise<{
    text: string;
    toolCalls?: ChatToolCall[];
    usage?: any;
}>;

export interface VercelAISDKClient {
    streamText: StreamTextFn;
    generateText: GenerateTextFn;
}

export class VercelAISDKAdapter extends AdapterWithCapabilities {
    private readonly sdk: VercelAISDKClient;
    private readonly usageHook?: (usage: ChatCompletion['usage']) => void;

    constructor(sdk: VercelAISDKClient, usageHook?: (usage: ChatCompletion['usage']) => void) {
        const client: ChatModelClient = {
            chat: async (messages, options) => {
                const res = await sdk.generateText({
                    messages,
                    model: options.model,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                });
                return {
                    messages: [...messages, { role: 'assistant', content: res.text }],
                    toolCalls: res.toolCalls,
                    finishReason: res.toolCalls?.length ? 'tool_calls' : 'stop',
                    usage: res.usage,
                } as ChatCompletion;
            },
            stream: async function* (messages, options) {
                const stream = sdk.streamText({
                    messages,
                    model: options.model,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                });
                for await (const chunk of stream.toAIStreamResponse()) {
                    yield {
                        messages: [...messages, { role: 'assistant', content: chunk.text }],
                        toolCalls: chunk.toolCalls,
                        finishReason: chunk.toolCalls?.length ? 'tool_calls' : 'stop',
                        usage: chunk.usage,
                    } as ChatCompletion;
                }
            },
        };

        super(
            'vercel-ai-sdk',
            {
                streaming: true,
                tools: true,
                embeddings: false,
                models: [],
            },
            client
        );
        this.sdk = sdk;
        this.usageHook = usageHook;
    }

    async chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion> {
        const res = await this.client!.chat(messages, options, ctx);
        if (res.usage) this.usageHook?.(res.usage);
        return res;
    }

    async *stream(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion> {
        if (!this.client?.stream) {
            yield await this.chat(messages, options, ctx);
            return;
        }
        for await (const chunk of this.client.stream(messages, options, ctx)) {
            if (chunk.usage) this.usageHook?.(chunk.usage);
            yield chunk;
        }
    }
}
