import { VercelAIGatewayAdapter, AIGatewayClient } from '../../src/runtime/adapters/llm/vercel-gateway';
import { ChatMessage } from '../../src/core/types/messages';
import { ExecutionContext } from '../../src/core/types/context';

const baseMessages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
const baseCtx: ExecutionContext = { requestId: 'req-1', runtime: 'node' };

describe('VercelAIGatewayAdapter', () => {
    it('wraps gateway chat responses', async () => {
        const gateway: AIGatewayClient = {
            async chat() {
                return { text: 'hello', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
            },
        };
        const adapter = new VercelAIGatewayAdapter(gateway);
        const res = await adapter.chat(baseMessages, { model: 'gpt' }, baseCtx);
        expect(res.messages.at(-1)?.content).toBe('hello');
        expect(res.usage?.totalTokens).toBe(15);
    });

    it('streams gateway chunks', async () => {
        const gateway: AIGatewayClient = {
            async chat() {
                return { text: 'not-used' };
            },
            stream: async function* () {
                yield { text: 'part-1', usage: { totalTokens: 1 } };
                yield { text: 'part-2', usage: { totalTokens: 2 } };
            },
        };
        const adapter = new VercelAIGatewayAdapter(gateway);
        const chunks: string[] = [];
        for await (const chunk of adapter.stream(baseMessages, { model: 'gpt' }, baseCtx)) {
            const last = chunk.messages.at(-1)?.content;
            chunks.push(typeof last === 'string' ? last : '[multimodal]');
        }
        expect(chunks).toEqual(['part-1', 'part-2']);
    });
});
