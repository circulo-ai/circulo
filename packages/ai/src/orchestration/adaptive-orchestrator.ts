/**
 * Strategy-driven orchestrator that operates over agent runtimes and tool adapters.
 */

import {
    AgentExecutionResult,
    CustomStrategy,
    OrchestrationContext,
    OrchestrationStrategy,
    Orchestrator,
    TaskSpec,
} from '../core/abstractions/orchestrator';
import { AgentRuntime, AgentInput } from '../core/types/agents';
import { ToolAdapter } from '../core/abstractions/tool-adapter';
import { MiddlewarePipeline } from '../runtime/middleware/pipeline';
import { runConsensus, runParallel, runRoundRobin, runSequential } from './strategies';
import { ApprovalManager } from './approvals';
import { ToolCallContext } from '../core/types/tools';

export interface AdaptiveOrchestratorOptions {
    strategy?: OrchestrationStrategy | CustomStrategy;
    middleware?: MiddlewarePipeline;
    approvals?: ApprovalManager;
}

export class AdaptiveOrchestrator implements Orchestrator {
    private readonly agents: Map<string, AgentRuntime> = new Map();
    private readonly tools: Map<string, ToolAdapter> = new Map();
    private strategy: OrchestrationStrategy | CustomStrategy = 'sequential';
    private readonly middleware: MiddlewarePipeline;
    private readonly approvals?: ApprovalManager;

    constructor(options: AdaptiveOrchestratorOptions = {}) {
        this.strategy = options.strategy ?? 'sequential';
        this.middleware = options.middleware ?? new MiddlewarePipeline();
        this.approvals = options.approvals;
    }

    registerAgent(agent: AgentRuntime): void {
        this.agents.set(agent.definition.id, agent);
    }

    registerTool(tool: ToolAdapter): void {
        this.tools.set(tool.schema.name, tool);
    }

    setStrategy(strategy: OrchestrationStrategy | CustomStrategy): void {
        this.strategy = strategy;
    }

    async execute(task: TaskSpec, ctx: OrchestrationContext): Promise<AgentExecutionResult[]> {
        const agents = Array.from(ctx.agents.values());

        if (this.approvals) {
            const approval = await this.approvals.ensureApproval(task, ctx);
            if (approval && approval.status !== 'approved') {
                return [
                    {
                        agentId: 'approval-gate',
                        success: false,
                        pendingApproval: true,
                        approvalRequestId: approval.id,
                        error: `Awaiting approval (${approval.status})`,
                        durationMs: 0,
                        metadata: { approvalStatus: approval.status },
                    },
                ];
            }
        }
        const executor = async (agent: AgentRuntime): Promise<AgentExecutionResult> => {
            const start = Date.now();
            try {
                const input: AgentInput = {
                    messages: (task.input?.messages as any) || [],
                    goal: task.goal,
                    metadata: task.metadata,
                };
                const result = await agent.act(input, ctx);
                const toolResults: Record<string, unknown> = {};

                if (result.toolCalls?.length) {
                    for (const call of result.toolCalls) {
                        const tool = this.tools.get(call.name);
                        if (!tool) {
                            toolResults[call.id] = { error: 'tool_not_found' };
                            continue;
                        }
                        const toolCtx: ToolCallContext = {
                            ...ctx,
                            toolName: call.name,
                            toolCallId: call.id,
                        };
                        await this.middleware.runBeforeTool(toolCtx, call.arguments);
                        const execResult =
                            typeof (tool as any).safeInvoke === 'function'
                                ? await (tool as any).safeInvoke(call.arguments, toolCtx)
                                : await tool.invoke(call.arguments as any, toolCtx);
                        toolResults[call.id] = execResult;
                        await this.middleware.runAfterTool(toolCtx, execResult);
                    }
                }

                return {
                    agentId: agent.definition.id,
                    success: true,
                    result,
                    durationMs: Date.now() - start,
                    toolResults: Object.keys(toolResults).length ? toolResults : undefined,
                };
            } catch (error) {
                return {
                    agentId: agent.definition.id,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    durationMs: Date.now() - start,
                };
            }
        };

        if (typeof this.strategy === 'function') {
            return this.strategy(agents, task, ctx);
        }

        switch (this.strategy) {
            case 'parallel':
                return runParallel(agents, executor);
            case 'round_robin':
                return runRoundRobin(agents, executor, task, ctx);
            case 'consensus':
                return runConsensus(agents, executor);
            case 'sequential':
            default:
                return runSequential(agents, executor);
        }
    }

    async handoff(fromAgentId: string, toAgentId: string, ctx: OrchestrationContext): Promise<void> {
        const from = this.agents.get(fromAgentId);
        const to = this.agents.get(toAgentId);
        if (!from || !to) {
            throw new Error(`Invalid handoff from ${fromAgentId} to ${toAgentId}`);
        }
        // Emit a middleware hook path for observability.
        await this.middleware.runOnError(ctx, new Error(`handoff:${fromAgentId}->${toAgentId}`));
    }
}
