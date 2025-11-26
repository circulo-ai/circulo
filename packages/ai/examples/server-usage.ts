/**
 * Minimal server-side example wiring:
 * - Redis-backed approvals/triggers
 * - Multi-agent + multi-tool registry
 * - Webhook handler + schedule ticker helpers
 * - LLM adapters (OpenAI/Vercel AI SDK/Gateway) with usage hooks
 *
 * This is illustrative: replace placeholders with your real clients and HTTP/cron wiring.
 */

import {
    AdaptiveOrchestrator,
    AdaptiveOrchestratorOptions,
    HumanApprovalManager,
    InMemoryApprovalStore,
    InMemoryTriggerStore,
    RedisApprovalStore,
    RedisTriggerStore,
    createWebhookHandler,
    createScheduleTicker,
    TaskQueue,
    TriggerManager,
    SDKFunctionTool,
    VercelAISDKAdapter,
    VercelAIGatewayAdapter,
    OpenAIAdapter,
    createRedisLike,
} from '../src';
import type { AgentRuntime, AgentInput, AgentActResult } from '../src/core/types/agents';
import type { ExecutionContext } from '../src/core/types/context';

// 1) Infrastructure: Redis-backed stores (swap with InMemory* in local/dev)
const myRedisClient: any = {}; // Replace with node-redis or ioredis client
const redisLike = createRedisLike(myRedisClient);
const approvalStore = myRedisClient ? new RedisApprovalStore(redisLike) : new InMemoryApprovalStore();
const triggerStore = myRedisClient ? new RedisTriggerStore(redisLike) : new InMemoryTriggerStore();

// 2) LLM adapters (choose the one you want; pass real SDK clients)
const openai = new OpenAIAdapter(/* openaiClient */, true, (usage) => {
    console.log('openai tokens', usage);
});
const vercelSdk = new VercelAISDKAdapter(
    {
        // streamText/generateText from @vercel/ai (provide actual functions here)
        streamText: () => ({ toAIStreamResponse: async function* () {} }),
        generateText: async () => ({ text: 'hello' }),
    },
    (usage) => console.log('vercel-ai usage', usage)
);
const vercelGateway = new VercelAIGatewayAdapter({
    async chat() {
        return { text: 'gateway hello' };
    },
});

// 3) Tools (multiple instances of the same logical tool with different configs)
const telegramToolA = new SDKFunctionTool(
    { name: 'telegram.sendMessage.botA', description: 'Send via bot A', parameters: { type: 'object' } } as any,
    async (params: any) => {
        // call Telegram bot A API
        return { ok: true, bot: 'A', params };
    }
);
const telegramToolB = new SDKFunctionTool(
    { name: 'telegram.sendMessage.botB', description: 'Send via bot B', parameters: { type: 'object' } } as any,
    async (params: any) => {
        // call Telegram bot B API
        return { ok: true, bot: 'B', params };
    }
);

// 4) Agents with tool access (agents can share or have distinct tool sets)
const agentA: AgentRuntime = {
    definition: { id: 'agent-A', name: 'Ops Agent', toolNames: [telegramToolA.schema.name, telegramToolB.schema.name] },
    async act(input: AgentInput): Promise<AgentActResult> {
        return { completion: `A handled: ${input.goal}` };
    },
};
const agentB: AgentRuntime = {
    definition: { id: 'agent-B', name: 'Gateway Agent', toolNames: [telegramToolA.schema.name] },
    async act(input: AgentInput): Promise<AgentActResult> {
        return { completion: `B handled: ${input.goal}` };
    },
};

// 5) Orchestrator with approvals and middleware hooks
const approvals = new HumanApprovalManager(undefined, approvalStore);
const orchestrator = new AdaptiveOrchestrator({
    approvals,
} as AdaptiveOrchestratorOptions);
orchestrator.registerAgent(agentA);
orchestrator.registerAgent(agentB);
orchestrator.registerTool(telegramToolA);
orchestrator.registerTool(telegramToolB);

// 6) Task queue + trigger manager
const queue = new TaskQueue();
const triggers = new TriggerManager(queue, triggerStore);

// queue handler runs orchestrator
queue.setHandler(async (task) => {
    const ctx: ExecutionContext = {
        requestId: `req-${task.id}`,
        runtime: 'node',
        taskId: task.id,
        agents: new Map([
            [agentA.definition.id, agentA],
            [agentB.definition.id, agentB],
        ]) as any,
        tools: new Map([
            [telegramToolA.schema.name, telegramToolA],
            [telegramToolB.schema.name, telegramToolB],
        ]) as any,
    };
    const results = await orchestrator.execute(task, ctx as any);
    console.log('task results', results);
});

// webhook handler (plug into HTTP route)
const handleWebhook = createWebhookHandler(triggers);
// Example: in your HTTP server, call handleWebhook('github.push', payload)

// schedule ticker (plug into cron/queue)
const tickSchedules = createScheduleTicker(triggers);
// Example: call tickSchedules() on an interval/cron job

// 7) Register triggers
void (async () => {
    await triggers.registerWebhook({
        topic: 'github.push',
        toTask: (payload) => ({
            id: `task-${payload.sha}`,
            goal: 'deploy after push',
            metadata: { requiresApproval: true },
        }),
    });

    await triggers.registerSchedule({
        id: 'nightly',
        runAt: Date.now() + 1000 * 60 * 60 * 24,
        toTask: () => ({ id: 'nightly', goal: 'nightly check' }),
    });
})();

// 8) Start queue processing
queue.start();
