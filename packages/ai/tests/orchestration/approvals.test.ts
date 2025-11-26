import { AdaptiveOrchestrator } from '../../src/orchestration/adaptive-orchestrator';
import { HumanApprovalManager, InMemoryApprovalStore } from '../../src/orchestration/approvals';
import { TaskSpec } from '../../src/core/abstractions/orchestrator';
import { AgentRuntime, AgentInput, AgentActResult } from '../../src/core/types/agents';
import { ExecutionContext } from '../../src/core/types/context';

const noopAgent: AgentRuntime = {
    definition: {
        id: 'agent-1',
        name: 'Test Agent',
    },
    async act(input: AgentInput): Promise<AgentActResult> {
        return { completion: `done: ${input.goal}` };
    },
};

const baseCtx: ExecutionContext = {
    requestId: 'req-1',
    runtime: 'node',
};

describe('AdaptiveOrchestrator approvals', () => {
    it('gates execution when approval is required', async () => {
        const store = new InMemoryApprovalStore();
        const approvals = new HumanApprovalManager(undefined, store);
        const orchestrator = new AdaptiveOrchestrator({ approvals });

        orchestrator.registerAgent(noopAgent);

        const ctx = {
            ...baseCtx,
            agents: new Map([[noopAgent.definition.id, noopAgent]]),
            tools: new Map(),
        };

        const task: TaskSpec = {
            id: 'task-1',
            goal: 'Sensitive action',
            metadata: { requiresApproval: true },
        };

        const results = await orchestrator.execute(task, ctx);
        expect(results[0].pendingApproval).toBe(true);
        expect(results[0].approvalRequestId).toBeDefined();

        // Approve and re-run
        const approvalId = results[0].approvalRequestId!;
        await approvals.approve(approvalId, 'approver-1');

        const rerun = await orchestrator.execute(task, ctx);
        expect(rerun[0].success).toBe(true);
        expect(rerun[0].pendingApproval).toBeFalsy();
    });
});
