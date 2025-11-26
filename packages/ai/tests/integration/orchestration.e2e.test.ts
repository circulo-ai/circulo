import { AdaptiveOrchestrator } from '../../src/orchestration/adaptive-orchestrator';
import { HumanApprovalManager, InMemoryApprovalStore } from '../../src/orchestration/approvals';
import { TaskQueue } from '../../src/orchestration/task-queue';
import { TriggerManager, InMemoryTriggerStore } from '../../src/orchestration/triggers';
import { AgentRuntime, AgentInput, AgentActResult } from '../../src/core/types/agents';
import { ExecutionContext } from '../../src/core/types/context';
import { TaskSpec } from '../../src/core/abstractions/orchestrator';
import { SDKFunctionTool } from '../../src/runtime/adapters/tools/sdk-tool';
import { ToolCallContext } from '../../src/core/types/tools';
import { TokenTracker } from '../../src/runtime/tokens/token-tracker';

const baseCtx: ExecutionContext = { requestId: 'req-e2e', runtime: 'node' };

const agentA: AgentRuntime = {
    definition: { id: 'agent-A', name: 'Agent A' },
    async act(input: AgentInput): Promise<AgentActResult> {
        return { completion: `A:${input.goal}` };
    },
};

const agentB: AgentRuntime = {
    definition: { id: 'agent-B', name: 'Agent B', toolNames: ['echo-tool'] },
    async act(input: AgentInput): Promise<AgentActResult> {
        return {
            completion: `B:${input.goal}`,
            toolCalls: [
                {
                    id: 'tc-1',
                    name: 'echo-tool',
                    arguments: { text: input.goal },
                },
            ],
        };
    },
};

describe('Integration: orchestrator + approvals + triggers', () => {
    it('runs task after approval and schedule trigger', async () => {
        const approvals = new HumanApprovalManager(undefined, new InMemoryApprovalStore());
        const orchestrator = new AdaptiveOrchestrator({ approvals });
        orchestrator.registerAgent(agentA);
        orchestrator.registerAgent(agentB);

        const queue = new TaskQueue();
        const triggerStore = new InMemoryTriggerStore();
        const triggers = new TriggerManager(queue, triggerStore);

        const echoTool = new SDKFunctionTool(
            {
                name: 'echo-tool',
                description: 'Echo text',
                parameters: { type: 'object', properties: { text: { type: 'string' } } },
            } as any,
            async (params: any, _ctx: ToolCallContext) => ({ echoed: params.text })
        );

        const tracker = new TokenTracker();
        const usageHook = tracker.applyHook('openai', 'conv1');

        const ctx = {
            ...baseCtx,
            agents: new Map([
                [agentA.definition.id, agentA],
                [agentB.definition.id, agentB],
            ]),
            tools: new Map([[echoTool.schema.name, echoTool]]),
            usageHook,
        };

        // Queue handler executes orchestrator
        const results: any[] = [];
        queue.setHandler(async (task: TaskSpec) => {
            const res = await orchestrator.execute(task, ctx);
            results.push(...res);
        });
        queue.start();

        // Webhook registers a task that requires approval
        await triggers.registerWebhook({
            topic: 'github.push',
            toTask: (payload) => ({
                id: `task-${payload.sha}`,
                goal: 'deploy after push',
                metadata: { requiresApproval: true },
            }),
        });

        triggers.handleWebhook('github.push', { sha: '123' });
        await new Promise((r) => setImmediate(r));

        // First run should be gated
        expect(results[0].pendingApproval).toBe(true);
        const approvalId = results[0].approvalRequestId as string;
        await approvals.approve(approvalId, 'approver-1');

        // Re-enqueue same task (simulating retry after approval)
        queue.enqueue({ id: 'task-123', goal: 'deploy after push' });
        await new Promise((r) => setImmediate(r));
        expect(results.at(-1)?.success).toBe(true);
        // Tool call captured from Agent B
        const toolCallResult = results.find((r) => r.agentId === agentB.definition.id);
        expect(toolCallResult?.result?.toolCalls?.[0]?.name).toBe('echo-tool');

        // Schedule trigger
        await triggers.registerSchedule({
            id: 'nightly',
            runAt: Date.now() - 1,
            intervalMs: undefined,
            toTask: () => ({ id: 'task-nightly', goal: 'nightly check' }),
        });
        triggers.processSchedules(Date.now());
        await new Promise((r) => setImmediate(r));

        const nightly = results.find((r) => r.agentId === agentA.definition.id && r.result?.completion.includes('nightly'));
        expect(nightly).toBeDefined();
    });
});
