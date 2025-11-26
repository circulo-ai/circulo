/**
 * Strategy-driven orchestrator contract for multi-agent hand-offs.
 */

import { AgentRuntime, AgentActResult } from '../types/agents';
import { ExecutionContext } from '../types/context';
import { ToolAdapter } from './tool-adapter';

export interface TaskSpec {
    id: string;
    goal: string;
    input?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface AgentExecutionResult {
    agentId: string;
    success: boolean;
    result?: AgentActResult;
    error?: string;
    durationMs: number;
    metadata?: Record<string, unknown>;
    approvalRequestId?: string;
    pendingApproval?: boolean;
    toolResults?: Record<string, unknown>;
}

export type CustomStrategy = (agents: AgentRuntime[], task: TaskSpec, ctx: OrchestrationContext) => Promise<AgentExecutionResult[]>;

export type OrchestrationStrategy = 'sequential' | 'parallel' | 'round_robin' | 'consensus' | 'custom';

export interface OrchestrationContext extends ExecutionContext {
    agents: Map<string, AgentRuntime>;
    tools: Map<string, ToolAdapter>;
    variables?: Map<string, unknown>;
}

export interface Orchestrator {
    registerAgent(agent: AgentRuntime): void;
    registerTool(tool: ToolAdapter): void;
    setStrategy(strategy: OrchestrationStrategy | CustomStrategy): void;
    execute(task: TaskSpec, ctx: OrchestrationContext): Promise<AgentExecutionResult[]>;
    handoff(fromAgentId: string, toAgentId: string, ctx: OrchestrationContext): Promise<void>;
}
