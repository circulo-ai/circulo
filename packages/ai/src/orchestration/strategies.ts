/**
 * Pluggable orchestration strategies for multi-agent coordination.
 */

import { AgentRuntime } from '../core/types/agents';
import { AgentExecutionResult, TaskSpec } from '../core/abstractions/orchestrator';
import { OrchestrationContext } from '../core/abstractions/orchestrator';

type AgentExecutor = (agent: AgentRuntime) => Promise<AgentExecutionResult>;

export async function runSequential(agents: AgentRuntime[], execute: AgentExecutor): Promise<AgentExecutionResult[]> {
    const results: AgentExecutionResult[] = [];
    for (const agent of agents) {
        const result = await execute(agent);
        results.push(result);
        if (!result.success) break;
    }
    return results;
}

export async function runParallel(agents: AgentRuntime[], execute: AgentExecutor): Promise<AgentExecutionResult[]> {
    return Promise.all(agents.map((agent) => execute(agent)));
}

export async function runRoundRobin(
    agents: AgentRuntime[],
    execute: AgentExecutor,
    _task: TaskSpec,
    _ctx: OrchestrationContext
): Promise<AgentExecutionResult[]> {
    if (agents.length === 0) return [];
    // For now, choose the first agent deterministically.
    const [first] = agents;
    return [await execute(first)];
}

export async function runConsensus(agents: AgentRuntime[], execute: AgentExecutor): Promise<AgentExecutionResult[]> {
    // Basic consensus: run all, then pick the highest confidence if provided.
    const results = await runParallel(agents, execute);
    results.sort((a, b) => (b.result?.confidence ?? 0) - (a.result?.confidence ?? 0));
    return results;
}
