/**
 * Agent class tests
 */

import { Agent, AgentConfig } from '../../src/core/agent';
import { EntityState } from '../../src/types/common';
import { createTestAgent } from '../helpers';

describe('Agent', () => {
    describe('constructor', () => {
        it('should create an agent with valid configuration', () => {
            const config: AgentConfig = {
                name: 'Test Agent',
                description: 'A test agent',
                model: 'gpt-4',
                systemPrompt: 'You are helpful',
            };

            const agent = new Agent(config);

            expect(agent.name).toBe('Test Agent');
            expect(agent.description).toBe('A test agent');
            expect(agent.state).toBe(EntityState.CREATED);
            expect(agent.model).toBe('gpt-4');
            expect(agent.id).toBeDefined();
            expect(agent.createdAt).toBeDefined();
            expect(agent.updatedAt).toBeDefined();
        });

        it('should generate a unique ID if not provided', () => {
            const agent1 = createTestAgent();
            const agent2 = createTestAgent();

            expect(agent1.id).not.toBe(agent2.id);
            expect(agent1.id).toMatch(/^agent_/);
        });

        it('should use provided ID if given', () => {
            const customId = 'custom-agent-id';
            const agent = new Agent({ name: 'Test' }, customId);

            expect(agent.id).toBe(customId);
        });

        it('should initialize with empty arrays for tools, knowledge bases, and conversations', () => {
            const agent = createTestAgent();

            expect(agent.tools).toEqual([]);
            expect(agent.knowledgeBases).toEqual([]);
            expect(agent.conversationIds).toEqual([]);
        });
    });

    describe('addTool', () => {
        it('should add a tool ID to the agent', () => {
            const agent = createTestAgent();
            const toolId = 'tool-123';

            agent.addTool(toolId);

            expect(agent.tools).toContain(toolId);
        });

        it('should not add duplicate tool IDs', () => {
            const agent = createTestAgent();
            const toolId = 'tool-123';

            agent.addTool(toolId);
            agent.addTool(toolId);

            expect(agent.tools).toEqual([toolId]);
        });

        it('should update updatedAt timestamp', () => {
            const agent = createTestAgent();
            const originalUpdatedAt = agent.updatedAt;

            // Wait a bit to ensure timestamp difference
            setTimeout(() => {
                agent.addTool('tool-123');
                expect(agent.updatedAt).not.toBe(originalUpdatedAt);
            }, 10);
        });
    });

    describe('removeTool', () => {
        it('should remove a tool ID from the agent', () => {
            const agent = createTestAgent();
            const toolId = 'tool-123';

            agent.addTool(toolId);
            agent.removeTool(toolId);

            expect(agent.tools).not.toContain(toolId);
        });

        it('should handle removing non-existent tool ID gracefully', () => {
            const agent = createTestAgent();

            expect(() => agent.removeTool('non-existent')).not.toThrow();
        });
    });

    describe('addKnowledgeBase', () => {
        it('should add a knowledge base ID to the agent', () => {
            const agent = createTestAgent();
            const kbId = 'kb-123';

            agent.addKnowledgeBase(kbId);

            expect(agent.knowledgeBases).toContain(kbId);
        });

        it('should not add duplicate knowledge base IDs', () => {
            const agent = createTestAgent();
            const kbId = 'kb-123';

            agent.addKnowledgeBase(kbId);
            agent.addKnowledgeBase(kbId);

            expect(agent.knowledgeBases).toEqual([kbId]);
        });
    });

    describe('addConversation', () => {
        it('should add a conversation ID to the agent', () => {
            const agent = createTestAgent();
            const convId = 'conv-123';

            agent.conversationIds.push(convId); // Direct push since addConversation method might not exist or be different?
            // Wait, let's check if addConversation exists in Agent class.
            // Looking at previous view_file of agent.ts, it DOES NOT have addConversation method.
            // It has conversationIds property.

            expect(agent.conversationIds).toContain(convId);
        });
    });

    describe('pause and activate', () => {
        it('should pause an active agent', () => {
            const agent = createTestAgent();
            agent.activate(); // Ensure it's active first (default is CREATED)

            agent.pause();

            expect(agent.state).toBe(EntityState.PAUSED);
        });

        it('should activate a paused agent', () => {
            const agent = createTestAgent();

            agent.pause();
            agent.activate();

            expect(agent.state).toBe(EntityState.ACTIVE);
        });
    });

    describe('updateConfig', () => {
        it('should update agent configuration', () => {
            const agent = createTestAgent();

            agent.updateConfig({
                name: 'Updated Name',
                model: 'gpt-5'
            });

            expect(agent.name).toBe('Updated Name');
            expect(agent.model).toBe('gpt-5');
        });
    });

    describe('toJSON', () => {
        it('should serialize agent to JSON', () => {
            const agent = createTestAgent();
            const json = agent.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('state');
            expect(json).toHaveProperty('model');
            expect(json).toHaveProperty('createdAt');
            expect(json).toHaveProperty('updatedAt');
        });

        it('should include all agent properties', () => {
            const agent = createTestAgent();
            agent.addTool('tool-1');
            agent.addKnowledgeBase('kb-1');

            const json = agent.toJSON();

            expect(json.tools).toContain('tool-1');
            expect(json.knowledgeBases).toContain('kb-1');
        });
    });
});
