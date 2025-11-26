/**
 * Simple local echo adapter useful for tests and offline flows.
 */

import { AdapterWithCapabilities } from './base';
import { ChatCompletion, ChatMessage, ChatOptions } from '../../../core/types/messages';
import { ExecutionContext } from '../../../core/types/context';

export class LocalLLMAdapter extends AdapterWithCapabilities {
    constructor() {
        super('local', {
            streaming: false,
            tools: false,
            embeddings: false,
            models: ['local-simulated'],
        });
    }

    async chat(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): Promise<ChatCompletion> {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
        const content = `Local adapter response for ${options.model || 'local-simulated'}: ${lastUserMessage}`;

        return {
            messages: [...messages, { role: 'assistant', content }],
            finishReason: 'stop',
            metadata: { requestId: ctx.requestId },
        };
    }

    async *stream(messages: ChatMessage[], options: ChatOptions, ctx: ExecutionContext): AsyncIterable<ChatCompletion> {
        yield await this.chat(messages, options, ctx);
    }
}
