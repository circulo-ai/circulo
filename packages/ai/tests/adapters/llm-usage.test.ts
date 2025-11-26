import { OpenAIAdapter } from '../../src/runtime/adapters/llm/openai';
import { ChatMessage, ChatOptions } from '../../src/core/types/messages';
import { ExecutionContext } from '../../src/core/types/context';
import { ChatModelClient } from '../../src/runtime/adapters/llm/base';

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
const opts: ChatOptions = { model: 'gpt-4' };
const ctx: ExecutionContext = { requestId: 'req-usage', runtime: 'node' };

describe('LLM adapters usage hooks', () => {
    it('invokes usage hook for OpenAIAdapter', async () => {
        let captured: any;
        const client: ChatModelClient = {
            async chat() {
                return {
                    messages,
                    finishReason: 'stop',
                    usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
                };
            },
        };
        const adapter = new OpenAIAdapter(client, true, (usage) => {
            captured = usage;
        });
        const res = await adapter.chat(messages, opts, ctx);
        expect(res.usage?.totalTokens).toBe(12);
        expect(captured?.completionTokens).toBe(7);
    });
});
