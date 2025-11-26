/**
 * Orchestrator tests
 */

import { Orchestrator, OrchestrationStrategy } from '../../src/orchestration/orchestrator';
import { InMemoryEventBus } from '../../src/orchestration/event-bus';
import { TaskScheduler } from '../../src/orchestration/task-scheduler';
import { createTestAgent, createTestTask, createTestConversation } from '../helpers';
import { EventType } from '../../src/core/event';
import { TaskStatus } from '../../src/core/task';

describe('Orchestrator', () => {
    let orchestrator: Orchestrator;
    let eventBus: InMemoryEventBus;
    let taskScheduler: TaskScheduler;

    beforeEach(() => {
        eventBus = new InMemoryEventBus();
        taskScheduler = new TaskScheduler({ ordering: 'priority' as any }, eventBus); // Cast to any to avoid enum import issues if any
        orchestrator = new Orchestrator({
            eventBus,
            taskScheduler,
            strategy: OrchestrationStrategy.SEQUENTIAL,
        });
    });

    describe('registerAgent', () => {
        it('should register an agent', () => {
            const agent = createTestAgent();
            orchestrator.registerAgent(agent);

            expect(orchestrator.getAgent(agent.id)).toBeDefined();
        });

        it('should emit agent registered event', async () => {
            const handler = jest.fn();
            eventBus.subscribe({ types: [EventType.AGENT_CREATED] }, handler);

            const agent = createTestAgent();
            orchestrator.registerAgent(agent);

            // Wait for event propagation
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('executeTask', () => {
        it('should execute task with assigned agent', async () => {
            const agent = createTestAgent();
            orchestrator.registerAgent(agent);

            const task = createTestTask({ assignedAgentId: agent.id });

            // We need to provide a context
            const context = {
                agents: new Map([[agent.id, agent]]),
                tools: new Map(),
                variables: new Map()
            };

            const results = await orchestrator.executeTask(task, context);

            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
            expect(results[0].agentId).toBe(agent.id);
            expect(task.status).toBe(TaskStatus.COMPLETED);
        });
    });

    describe('coordinateConversation', () => {
        it('should handle conversation coordination', async () => {
            const agent = createTestAgent();
            orchestrator.registerAgent(agent);

            const conversation = createTestConversation({ agentIds: [agent.id] });

            const results = await orchestrator.coordinateConversation(conversation, 'Hello', 'user-1');

            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
        });
    });
});
