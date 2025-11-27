# @circulo-ai/ai

A modular, Edge-friendly TypeScript SDK for building multi-agent, multi-tool systems with pluggable LLM providers, MCP tool bridging, approvals/triggers, and Redis-friendly persistence. No legacy `AISDKClient`—use the lightweight adapters and orchestrator shown below.

## Install

```bash
npm install @circulo-ai/ai
```

Entry points:
- Node/server: `@circulo-ai/ai` (index.node)
- Edge: `@circulo-ai/ai/dist/index.edge`

## Core primitives

- **Types**: `ChatMessage` (supports multimodal parts + threading), `AgentRuntime`, `ToolAdapter`, `ExecutionContext`, `TaskSpec`.
- **LLM adapters**: `OpenAIAdapter`, `AnthropicAdapter`, `VercelAIAdapter`, `VercelAIGatewayAdapter`, `VercelAISDKAdapter`, `LocalLLMAdapter`. All accept usage hooks and streaming.
- **Tools**: `SDKFunctionTool` (local functions), `MCPToolAdapter` (MCP servers), `ToolRegistry`.
- **Orchestration**: `AdaptiveOrchestrator` (strategies, tool execution, approval gating), helpers in `orchestration/strategies`.
- **Approvals**: `HumanApprovalManager` with pluggable stores (`InMemoryApprovalStore`, `RedisApprovalStore`).
- **Triggers**: `TriggerManager` with webhook/schedule triggers (`InMemoryTriggerStore`, `RedisTriggerStore`, helpers `createWebhookHandler`, `createScheduleTicker`).
- **Storage**: `ConversationStore` (memory/Redis), `HistoryManager`, `InMemoryVectorStore`.
- **Persistence helpers**: Redis adapters (`createRedisLike`, `RedisConversationStore`), generic `RedisStore` types.
- **Token tracking**: `TokenTracker` to aggregate usage via adapter hooks and enforce budgets.

## Quick start

```ts
import {
  AdaptiveOrchestrator,
  SDKFunctionTool,
  ToolCallContext,
  ChatMessage,
  OpenAIAdapter,
  HumanApprovalManager,
  InMemoryApprovalStore,
} from '@circulo-ai/ai';

const llm = new OpenAIAdapter(/* openai client */, true);

const echoTool = new SDKFunctionTool(
  { name: 'echo', description: 'Echo text', parameters: { type: 'object' } } as any,
  async (params: any, _ctx: ToolCallContext) => ({ echoed: params.text })
);

const agent = {
  definition: { id: 'agent-1', name: 'Assistant', toolNames: [echoTool.schema.name] },
  async act(input: { messages: ChatMessage[]; goal?: string }) {
    // Use llm.chat in your implementation; stubbed for brevity
    return { completion: `You said: ${input.goal}` };
  },
};

const orchestrator = new AdaptiveOrchestrator({
  approvals: new HumanApprovalManager(undefined, new InMemoryApprovalStore()),
});
orchestrator.registerTool(echoTool);
orchestrator.registerAgent(agent);

const task = { id: 'task-1', goal: 'Say hello', input: { messages: [] } } as any;
const results = await orchestrator.execute(task, {
  requestId: 'req-1',
  runtime: 'node',
  agents: new Map([[agent.definition.id, agent]]),
  tools: new Map([[echoTool.schema.name, echoTool]]),
} as any);
```

## MCP tools

```ts
import { DefaultMCPClient, InMemoryTransport, MCPToolAdapter } from '@circulo-ai/ai';

const mcpClient = new DefaultMCPClient(
  { serverId: 'my-mcp', name: 'My MCP', version: '1.0', capabilities: [] },
  new InMemoryTransport()
);
const tools = await mcpClient.listTools();
const adapters = tools.map(
  (t) => new MCPToolAdapter({ name: t.name, description: t.description, parameters: t.parameters || {} }, mcpClient)
);
```

## Approvals and triggers

```ts
import { HumanApprovalManager, TriggerManager, TaskQueue, InMemoryTriggerStore } from '@circulo-ai/ai';

const approvals = new HumanApprovalManager(); // uses requiresApproval metadata
const queue = new TaskQueue();
const triggers = new TriggerManager(queue, new InMemoryTriggerStore());
const handleWebhook = triggers.handleWebhook.bind(triggers);
const tickSchedules = triggers.processSchedules.bind(triggers);
```

## Persistence (Redis)

```ts
import { RedisApprovalStore, RedisTriggerStore, RedisConversationStore, createRedisLike } from '@circulo-ai/ai';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
const redisLike = createRedisLike(redis);
const approvalStore = new RedisApprovalStore(redisLike);
const triggerStore = new RedisTriggerStore(redisLike);
const convStore = new RedisConversationStore(redisLike);
```

## Next.js (Edge-friendly)

Use the Edge entrypoint for Edge/runtime-constrained environments. Example webhook route:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runChatOrchestration } from '@circulo-ai/ai';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const chatId = req.nextUrl.searchParams.get('chatId');
  if (!chatId) return NextResponse.json({ error: 'chatId required' }, { status: 400 });
  const result = await runChatOrchestration(chatId, { type: 'webhook', payload });
  return NextResponse.json({ results: result.results, usage: result.usage });
}
```

## Exports (high level)

- Adapters: LLM (`OpenAIAdapter`, `AnthropicAdapter`, `VercelAIAdapter`, `VercelAIGatewayAdapter`, `VercelAISDKAdapter`, `LocalLLMAdapter`), tools (`SDKFunctionTool`, `MCPToolAdapter`, `ToolRegistry`)
- Orchestration: `AdaptiveOrchestrator`, strategies, approvals (`HumanApprovalManager`, stores), triggers (`TriggerManager`, helpers)
- Storage/persistence: `ConversationStore`, `HistoryManager`, `RedisConversationStore`, `RedisApprovalStore`, `RedisTriggerStore`, `createRedisLike`
- Types/utilities: `ChatMessage`, `AgentRuntime`, `ToolAdapter`, `ExecutionContext`, `TaskSpec`, `TokenTracker`, `InMemoryVectorStore`

## Notes

- Legacy classes/clients were removed; rely on the abstractions above.
- Keep code Edge-safe when targeting Next.js Edge runtime.
