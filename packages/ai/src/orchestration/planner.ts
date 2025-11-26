/**
 * Simple planner that can be swapped for more advanced routing logic.
 */

import { AgentPlan, AgentRuntime, PlanStep } from '../core/types/agents';
import { ExecutionContext } from '../core/types/context';
import { TaskSpec } from '../core/abstractions/orchestrator';

export interface Planner {
    createPlan(task: TaskSpec, agents: AgentRuntime[], ctx: ExecutionContext): Promise<AgentPlan>;
}

export class HeuristicPlanner implements Planner {
    async createPlan(task: TaskSpec, agents: AgentRuntime[]): Promise<AgentPlan> {
        const steps: PlanStep[] = agents.map((agent, index) => ({
            id: `${task.id}-step-${index + 1}`,
            description: `Agent ${agent.definition.name} evaluates goal: ${task.goal}`,
            dependsOn: index === 0 ? [] : [`${task.id}-step-${index}`],
        }));

        return {
            steps,
            rationale: 'Simple linear plan across registered agents.',
        };
    }
}
