/**
 * Multi-agent orchestrator
 */

import EventEmitter from 'eventemitter3';
import { ID } from '../types/common';
import { Agent, AgentContext, AgentMessage, AgentResponse } from '../core/agent';
import { Conversation } from '../core/conversation';
import { Task, TaskStatus } from '../core/task';
import { Tool, ToolExecutionContext } from '../core/tool';
import { EventBus, EventType } from '../core/event';
import { TaskScheduler } from './task-scheduler';

/**
 * Orchestration strategy
 */
export enum OrchestrationStrategy {
    SEQUENTIAL = 'sequential',
    PARALLEL = 'parallel',
    ROUND_ROBIN = 'round_robin',
    LEADER_FOLLOWER = 'leader_follower',
    CONSENSUS = 'consensus',
    CUSTOM = 'custom',
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
    strategy?: OrchestrationStrategy;
    eventBus?: EventBus;
    taskScheduler?: TaskScheduler;
    maxRetries?: number;
    timeout?: number;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
    agentId: ID;
    success: boolean;
    response?: AgentResponse;
    error?: string;
    executionTime: number;
}

/**
 * Orchestration context
 */
export interface OrchestrationContext {
    conversationId?: ID;
    taskId?: ID;
    userId?: ID;
    agents: Map<ID, Agent>;
    tools: Map<ID, Tool>;
    variables: Map<string, unknown>;
}

/**
 * Orchestrator interface
 */
export interface IOrchestrator {
    /**
     * Register an agent
     */
    registerAgent(agent: Agent): void;

    /**
     * Unregister an agent
     */
    unregisterAgent(agentId: ID): boolean;

    /**
     * Register a tool
     */
    registerTool(tool: Tool): void;

    /**
     * Unregister a tool
     */
    unregisterTool(toolId: ID): boolean;

    /**
     * Execute a task with orchestration
     */
    executeTask(task: Task, context: OrchestrationContext): Promise<AgentExecutionResult[]>;

    /**
     * Delegate a task to a specific agent
     */
    delegateToAgent(agentId: ID, task: Task, context: AgentContext): Promise<AgentExecutionResult>;

    /**
     * Coordinate multiple agents for a conversation
     */
    coordinateConversation(
        conversation: Conversation,
        message: string,
        userId?: ID
    ): Promise<AgentExecutionResult[]>;
}

/**
 * Orchestrator implementation
 */
export class Orchestrator extends EventEmitter implements IOrchestrator {
    private agents: Map<ID, Agent> = new Map();
    private tools: Map<ID, Tool> = new Map();
    private config: OrchestratorConfig;
    private eventBus?: EventBus;
    private taskScheduler?: TaskScheduler;

    constructor(config: OrchestratorConfig = {}) {
        super();
        this.config = {
            strategy: OrchestrationStrategy.SEQUENTIAL,
            maxRetries: 3,
            timeout: 30000,
            ...config,
        };
        this.eventBus = config.eventBus;
        this.taskScheduler = config.taskScheduler;
    }

    /**
     * Register an agent
     */
    registerAgent(agent: Agent): void {
        this.agents.set(agent.id, agent);
        this.emit('agent:registered', agent);

        if (this.eventBus) {
            this.eventBus.publish({
                type: EventType.AGENT_CREATED,
                source: 'orchestrator',
                sourceId: agent.id,
                payload: agent.toJSON() as any,
            });
        }
    }

    /**
     * Unregister an agent
     */
    unregisterAgent(agentId: ID): boolean {
        const deleted = this.agents.delete(agentId);
        if (deleted) {
            this.emit('agent:unregistered', agentId);
        }
        return deleted;
    }

    /**
     * Register a tool
     */
    registerTool(tool: Tool): void {
        this.tools.set(tool.id, tool);
        this.emit('tool:registered', tool);
    }

    /**
     * Unregister a tool
     */
    unregisterTool(toolId: ID): boolean {
        return this.tools.delete(toolId);
    }

    /**
     * Get an agent by ID
     */
    getAgent(agentId: ID): Agent | undefined {
        return this.agents.get(agentId);
    }

    /**
     * Get a tool by ID
     */
    getTool(toolId: ID): Tool | undefined {
        return this.tools.get(toolId);
    }

    /**
     * Execute a task with orchestration
     */
    async executeTask(task: Task, context: OrchestrationContext): Promise<AgentExecutionResult[]> {
        this.emit('task:executing', task);

        const strategy = this.config.strategy || OrchestrationStrategy.SEQUENTIAL;
        const agents = Array.from(context.agents.values());

        let results: AgentExecutionResult[] = [];

        switch (strategy) {
            case OrchestrationStrategy.SEQUENTIAL:
                results = await this.executeSequential(agents, task, context);
                break;

            case OrchestrationStrategy.PARALLEL:
                results = await this.executeParallel(agents, task, context);
                break;

            case OrchestrationStrategy.ROUND_ROBIN:
                results = await this.executeRoundRobin(agents, task, context);
                break;

            case OrchestrationStrategy.LEADER_FOLLOWER:
                results = await this.executeLeaderFollower(agents, task, context);
                break;

            default:
                results = await this.executeSequential(agents, task, context);
        }

        this.emit('task:executed', task, results);
        return results;
    }

    /**
     * Delegate a task to a specific agent
     */
    async delegateToAgent(agentId: ID, task: Task, context: AgentContext): Promise<AgentExecutionResult> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return {
                agentId,
                success: false,
                error: `Agent ${agentId} not found`,
                executionTime: 0,
            };
        }

        const startTime = Date.now();

        try {
            task.assign(agentId);
            task.start();

            this.emit('agent:executing', agent, task);

            // In a real implementation, this would call the agent's execution logic
            // For now, we simulate execution
            const response: AgentResponse = {
                message: {
                    id: this.generateId(),
                    agentId: agent.id,
                    conversationId: context.conversationId || '',
                    role: 'agent',
                    content: `Task ${task.name} executed by ${agent.name}`,
                    timestamp: new Date().toISOString(),
                },
            };

            task.complete({ response });

            const executionTime = Date.now() - startTime;

            this.emit('agent:executed', agent, task, response);

            if (this.eventBus) {
                this.eventBus.publish({
                    type: EventType.TASK_COMPLETED,
                    source: 'orchestrator',
                    sourceId: task.id,
                    payload: { task: task.toJSON(), agent: agent.toJSON() },
                });
            }

            return {
                agentId: agent.id,
                success: true,
                response,
                executionTime,
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            task.fail(errorMessage);

            this.emit('agent:error', agent, task, error);

            if (this.eventBus) {
                this.eventBus.publish({
                    type: EventType.TASK_FAILED,
                    source: 'orchestrator',
                    sourceId: task.id,
                    payload: { task: task.toJSON(), error: errorMessage },
                });
            }

            return {
                agentId: agent.id,
                success: false,
                error: errorMessage,
                executionTime,
            };
        }
    }

    /**
     * Coordinate multiple agents for a conversation
     */
    async coordinateConversation(
        conversation: Conversation,
        message: string,
        userId?: ID
    ): Promise<AgentExecutionResult[]> {
        const agentParticipants = conversation.getAgents();
        const results: AgentExecutionResult[] = [];

        for (const participant of agentParticipants) {
            const agent = this.agents.get(participant.id);
            if (!agent) continue;

            const context: AgentContext = {
                agentId: agent.id,
                conversationId: conversation.id,
                userId,
            };

            // Create a task for this agent
            const task = new Task({
                name: `Process message in conversation ${conversation.id}`,
                type: 'conversation_message',
                assignedAgentId: agent.id,
                conversationId: conversation.id,
                input: { message },
            });

            const result = await this.delegateToAgent(agent.id, task, context);
            results.push(result);
        }

        return results;
    }

    /**
     * Execute agents sequentially
     */
    private async executeSequential(
        agents: Agent[],
        task: Task,
        context: OrchestrationContext
    ): Promise<AgentExecutionResult[]> {
        const results: AgentExecutionResult[] = [];

        for (const agent of agents) {
            const agentContext: AgentContext = {
                agentId: agent.id,
                conversationId: context.conversationId,
                taskId: task.id,
                userId: context.userId,
            };

            const result = await this.delegateToAgent(agent.id, task, agentContext);
            results.push(result);

            // Stop if an agent fails
            if (!result.success) {
                break;
            }
        }

        return results;
    }

    /**
     * Execute agents in parallel
     */
    private async executeParallel(
        agents: Agent[],
        task: Task,
        context: OrchestrationContext
    ): Promise<AgentExecutionResult[]> {
        const promises = agents.map((agent) => {
            const agentContext: AgentContext = {
                agentId: agent.id,
                conversationId: context.conversationId,
                taskId: task.id,
                userId: context.userId,
            };

            return this.delegateToAgent(agent.id, task, agentContext);
        });

        return Promise.all(promises);
    }

    /**
     * Execute agents in round-robin fashion
     */
    private async executeRoundRobin(
        agents: Agent[],
        task: Task,
        context: OrchestrationContext
    ): Promise<AgentExecutionResult[]> {
        if (agents.length === 0) return [];

        // Select agent based on task count or other criteria
        const selectedAgent = agents[0]; // Simplified selection

        const agentContext: AgentContext = {
            agentId: selectedAgent.id,
            conversationId: context.conversationId,
            taskId: task.id,
            userId: context.userId,
        };

        const result = await this.delegateToAgent(selectedAgent.id, task, agentContext);
        return [result];
    }

    /**
     * Execute with leader-follower pattern
     */
    private async executeLeaderFollower(
        agents: Agent[],
        task: Task,
        context: OrchestrationContext
    ): Promise<AgentExecutionResult[]> {
        if (agents.length === 0) return [];

        const leader = agents[0];
        const followers = agents.slice(1);

        // Execute leader first
        const leaderContext: AgentContext = {
            agentId: leader.id,
            conversationId: context.conversationId,
            taskId: task.id,
            userId: context.userId,
        };

        const leaderResult = await this.delegateToAgent(leader.id, task, leaderContext);
        const results = [leaderResult];

        // If leader succeeds, execute followers in parallel
        if (leaderResult.success) {
            const followerResults = await this.executeParallel(followers, task, context);
            results.push(...followerResults);
        }

        return results;
    }

    private generateId(): ID {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
