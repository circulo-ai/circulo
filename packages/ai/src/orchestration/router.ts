/**
 * Agent router responsible for deciding which agent should handle a task or tool call.
 */

import { AgentRuntime } from '../core/types/agents';
import { TaskSpec } from '../core/abstractions/orchestrator';
import { ExecutionContext } from '../core/types/context';

export interface RoutingDecision {
    agent: AgentRuntime;
    reason?: string;
}

export class Router {
    pickAgent(agents: AgentRuntime[], task: TaskSpec, _ctx: ExecutionContext): RoutingDecision | null {
        if (agents.length === 0) return null;
        // Placeholder heuristic: choose the first agent with declared tools matching the task input hint.
        const preferredTool = task.input?.preferredTool as string | undefined;
        const found = preferredTool ? agents.find((agent) => agent.definition.toolNames?.includes(preferredTool)) : undefined;
        const agent = found ?? agents[0];

        return { agent, reason: found ? 'matched tool preference' : 'default-first-agent' };
    }
}
