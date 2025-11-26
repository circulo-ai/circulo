/**
 * Tailored example for a Next.js (app router) deployment using:
 * - Redis-backed approvals & triggers
 * - Webhook handler (API route)
 * - Schedule ticker (cron/Edge function)
 * - LLM adapters (OpenAI, Vercel AI SDK) with usage hooks
 * - Multi-agent, multi-tool setup (e.g., multiple Telegram bot instances)
 *
 * Replace placeholder imports with your real SDK clients and environment variables.
 */

// import { NextRequest, NextResponse } from 'next/server'; // Uncomment in your Next.js project
import {
    AdaptiveOrchestrator,
    HumanApprovalManager,
    RedisApprovalStore,
    RedisTriggerStore,
    TriggerManager,
    TaskQueue,
    createWebhookHandler,
    createScheduleTicker,
    SDKFunctionTool,
    OpenAIAdapter,
    VercelAISDKAdapter,
    createRedisLike,
} from '../src';
import type { AgentRuntime, AgentInput, AgentActResult } from '../src/core/types/agents';
import type { ExecutionContext } from '../src/core/types/context';

// ---------- Infrastructure ----------
// Replace with your Redis client (node-redis or ioredis). Example using ioredis:
// import Redis from 'ioredis';
// const redisClient = new Redis(process.env.REDIS_URL!);
const redisClient: any = {}; // placeholder
const redisLike = createRedisLike(redisClient);

const approvalStore = new RedisApprovalStore(redisLike, 'ai:approvals');
const triggerStore = new RedisTriggerStore(redisLike, 'ai:triggers');

// ---------- LLM Adapters ----------
// Provide real clients; usage hooks emit token telemetry.
const openaiAdapter = new OpenAIAdapter(/* openaiClient */, true, (usage) =>
    console.log('openai usage', usage)
);
const vercelAIAdapter = new VercelAISDKAdapter(
    {
        // Provide real functions from @vercel/ai
        streamText: () => ({ toAIStreamResponse: async function* () {} }),
        generateText: async () => ({ text: 'hello from vercel-ai' }),
    },
    (usage) => console.log('vercel-ai usage', usage)
);

// ---------- Tools (multiple variants of same logical tool) ----------
const telegramBotA = new SDKFunctionTool(
    { name: 'telegram.sendMessage.botA', description: 'Send via Bot A', parameters: { type: 'object' } } as any,
    async (params: any) => {
        // call Telegram Bot A API here
        return { ok: true, bot: 'A', params };
    }
);
const telegramBotB = new SDKFunctionTool(
    { name: 'telegram.sendMessage.botB', description: 'Send via Bot B', parameters: { type: 'object' } } as any,
    async (params: any) => {
        // call Telegram Bot B API here
        return { ok: true, bot: 'B', params };
    }
);

// ---------- Agents ----------
const agentOps: AgentRuntime = {
    definition: { id: 'agent-ops', name: 'Ops', toolNames: [telegramBotA.schema.name, telegramBotB.schema.name] },
    async act(input: AgentInput): Promise<AgentActResult> {
        return { completion: `Ops handled: ${input.goal}` };
    },
};

const agentNotify: AgentRuntime = {
    definition: { id: 'agent-notify', name: 'Notifier', toolNames: [telegramBotA.schema.name] },
    async act(input: AgentInput): Promise<AgentActResult> {
        return {
            completion: `Notify: ${input.goal}`,
            toolCalls: [
                { id: 'tc-1', name: 'telegram.sendMessage.botA', arguments: { text: input.goal } },
            ],
        };
    },
};

// ---------- Orchestrator + Queue + Triggers ----------
const approvals = new HumanApprovalManager(undefined, approvalStore);
const orchestrator = new AdaptiveOrchestrator({ approvals });
orchestrator.registerAgent(agentOps);
orchestrator.registerAgent(agentNotify);
orchestrator.registerTool(telegramBotA);
orchestrator.registerTool(telegramBotB);

const queue = new TaskQueue();
const triggers = new TriggerManager(queue, triggerStore);

// Queue handler: execute tasks via orchestrator
queue.setHandler(async (task) => {
    const ctx: ExecutionContext = {
        requestId: `req-${task.id}`,
        runtime: 'node',
        taskId: task.id,
        agents: new Map([
            [agentOps.definition.id, agentOps],
            [agentNotify.definition.id, agentNotify],
        ]) as any,
        tools: new Map([
            [telegramBotA.schema.name, telegramBotA],
            [telegramBotB.schema.name, telegramBotB],
        ]) as any,
    };
    const results = await orchestrator.execute(task, ctx as any);
    console.log('task results', results);
});

// ---------- Webhook handler (Next.js route) ----------
// Example route handler (uncomment types when used in Next.js):
/*
export async function POST(req: NextRequest) {
    const payload = await req.json();
    const topic = req.nextUrl.searchParams.get('topic') || 'github.push';
    const res = await handleWebhook(topic, payload);
    return NextResponse.json({ enqueued: Boolean(res?.enqueued), task: res?.task });
}
*/
const handleWebhook = createWebhookHandler(triggers);

// ---------- Schedule ticker (cron/Edge function) ----------
const tickSchedules = createScheduleTicker(triggers);
// Call tickSchedules() from your cron job or background worker.

// ---------- Register triggers ----------
void (async () => {
    await triggers.registerWebhook({
        topic: 'github.push',
        toTask: (payload) => ({
            id: `task-${payload.sha}`,
            goal: `deploy ${payload.sha}`,
            metadata: { requiresApproval: true },
        }),
    });

    await triggers.registerSchedule({
        id: 'nightly',
        runAt: Date.now() + 1000 * 60 * 60 * 24,
        toTask: () => ({ id: 'nightly', goal: 'nightly check' }),
    });
})();

// ---------- Start queue (in your server/worker bootstrap) ----------
queue.start();
