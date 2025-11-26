import { MiddlewarePipeline } from '../../src/runtime/middleware/pipeline';
import { SDKFunctionTool } from '../../src/runtime/adapters/tools/sdk-tool';
import { ToolCallContext } from '../../src/core/types/tools';

describe('MiddlewarePipeline with tool execution', () => {
    it('runs before/after hooks around tool invocation', async () => {
        const calls: string[] = [];
        const middleware = new MiddlewarePipeline();
        middleware.use({
            beforeTool: () => {
                calls.push('before');
            },
            afterTool: () => {
                calls.push('after');
            },
        });

        const tool = new SDKFunctionTool(
            { name: 'echo', description: 'echo', parameters: { type: 'object' } } as any,
            async (params: any) => ({ echoed: params.value })
        );

        const ctx: ToolCallContext = {
            requestId: 'req',
            runtime: 'node',
            toolName: 'echo',
            toolCallId: 'tc1',
        };

        await middleware.runBeforeTool(ctx, { value: 'a' });
        const result = await tool.invoke({ value: 'a' }, ctx);
        await middleware.runAfterTool(ctx, result);

        expect(result).toEqual({ echoed: 'a' });
        expect(calls).toEqual(['before', 'after']);
    });
});
