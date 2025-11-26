/**
 * Adapter specifically for the Vercel AI SDK / AI Gateway. Accepts the gateway client shape to avoid hard dependency.
 */

import { AdapterWithCapabilities } from './base';
import { ChatMessage, ChatOptions, ChatCompletion, ChatToolCall } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

export interface AIGatewayChatResult {
    text: string;
    toolCalls?: ChatToolCall[];
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}

export interface AIGatewayClient {
    chat(params: { messages: ChatMessage[]; model: string; temperature?: number; maxTokens?: number }, ctx: ExecutionContext): Promise<AIGatewayChatResult>;
    stream?(params: { messages: ChatMessage[]; model: string; temperature?: number; maxTokens?: number }, ctx: ExecutionContext): AsyncIterable<AIGatewayChatResult>;
}

export class VercelAIGatewayAdapter extends AdapterWithCapabilities {
    private readonly gateway: AIGatewayClient;

    constructor(gateway: AIGatewayClient) {
        super(
            'vercel-ai-gateway',
            {
                streaming: true,
                tools: true,
                embeddings: false,
                models: [],
            },
            {
                chat: (messages, options, ctx) => gateway.chat({ messages, model: options.model, temperature: options.temperature, maxTokens: options.maxTokens }, ctx) as any,
                stream: gateway.stream
                    ? async function* (messages, options, ctx) {
                          for await (const chunk of gateway.stream!(
                              { messages, model: options.model, temperature: options.temperature, maxTokens: options.maxTokens },
                              ctx
                          )) {
                              yield chunk as any;
                          }
                      }
                    : undefined,
            }
        );
        this.gateway = gateway;
    }

    async chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion> {
        const res = await this.gateway.chat({ messages, model: options.model, temperature: options.temperature, maxTokens: options.maxTokens }, ctx);
        return this.toCompletion(messages, res, ctx);
    }

    async *stream(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion> {
        if (!this.gateway.stream) {
            yield await this.chat(messages, options, ctx);
            return;
        }
        for await (const chunk of this.gateway.stream({ messages, model: options.model, temperature: options.temperature, maxTokens: options.maxTokens }, ctx)) {
            yield this.toCompletion(messages, chunk, ctx);
        }
    }

    private toCompletion(messages: ChatMessage[], result: AIGatewayChatResult, ctx: ExecutionContext): ChatCompletion {
        return {
            messages: [...messages, { role: 'assistant', content: result.text }],
            toolCalls: result.toolCalls,
            finishReason: result.toolCalls?.length ? 'tool_calls' : 'stop',
            usage: result.usage
                ? {
                      promptTokens: result.usage.promptTokens ?? 0,
                      completionTokens: result.usage.completionTokens ?? 0,
                      totalTokens: result.usage.totalTokens ?? 0,
                  }
                : undefined,
            metadata: { requestId: ctx.requestId, runtime: ctx.runtime },
        };
    }
}
