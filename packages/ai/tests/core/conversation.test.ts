/**
 * Conversation class tests
 */

import { Conversation, ParticipantType } from '../../src/core/conversation';
import { EntityState } from '../../src/types/common';
import { createTestConversation } from '../helpers';

describe('Conversation', () => {
    describe('constructor', () => {
        it('should create a conversation with valid configuration', () => {
            const conversation = createTestConversation();

            expect(conversation.title).toBe('Test Conversation');
            expect(conversation.state).toBe(EntityState.ACTIVE);
            expect(conversation.participants).toEqual([]);
            expect(conversation.messageIds).toEqual([]);
            expect(conversation.id).toBeDefined();
        });

        it('should add agent participants from config', () => {
            const conversation = new Conversation({
                title: 'Test',
                agentIds: ['agent-1', 'agent-2'],
            });

            expect(conversation.participants).toHaveLength(2);
            expect(conversation.participants[0].type).toBe(ParticipantType.AGENT);
        });

        it('should add user participants from config', () => {
            const conversation = new Conversation({
                title: 'Test',
                userIds: ['user-1', 'user-2'],
            });

            expect(conversation.participants).toHaveLength(2);
            expect(conversation.participants[0].type).toBe(ParticipantType.USER);
        });
    });

    describe('addParticipant', () => {
        it('should add a participant to the conversation', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT, 'Agent 1');

            expect(conversation.participants).toHaveLength(1);
            expect(conversation.participants[0].id).toBe('agent-1');
            expect(conversation.participants[0].type).toBe(ParticipantType.AGENT);
            expect(conversation.participants[0].name).toBe('Agent 1');
        });

        it('should not add duplicate participants', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT);
            conversation.addParticipant('agent-1', ParticipantType.AGENT);

            expect(conversation.participants).toHaveLength(1);
        });

        it('should set joinedAt timestamp', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT);

            expect(conversation.participants[0].joinedAt).toBeDefined();
        });
    });

    describe('removeParticipant', () => {
        it('should remove a participant from the conversation', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT);
            conversation.removeParticipant('agent-1');

            expect(conversation.participants).toHaveLength(0);
        });

        it('should handle removing non-existent participant', () => {
            const conversation = createTestConversation();

            expect(() => conversation.removeParticipant('non-existent')).not.toThrow();
        });
    });

    describe('addMessage', () => {
        it('should add a message ID to the conversation', () => {
            const conversation = createTestConversation();

            conversation.addMessage('msg-1');

            expect(conversation.messageIds).toContain('msg-1');
        });

        it('should update updatedAt timestamp', () => {
            const conversation = createTestConversation();
            const originalUpdatedAt = conversation.updatedAt;

            setTimeout(() => {
                conversation.addMessage('msg-1');
                expect(conversation.updatedAt).not.toBe(originalUpdatedAt);
            }, 10);
        });
    });

    describe('addArtifact', () => {
        it('should add an artifact ID to the conversation', () => {
            const conversation = createTestConversation();

            conversation.addArtifact('artifact-1');

            expect(conversation.artifactIds).toContain('artifact-1');
        });

        it('should not add duplicate artifact IDs', () => {
            const conversation = createTestConversation();

            conversation.addArtifact('artifact-1');
            conversation.addArtifact('artifact-1');

            expect(conversation.artifactIds).toEqual(['artifact-1']);
        });
    });

    describe('addTask', () => {
        it('should add a task ID to the conversation', () => {
            const conversation = createTestConversation();

            conversation.addTask('task-1');

            expect(conversation.taskIds).toContain('task-1');
        });

        it('should not add duplicate task IDs', () => {
            const conversation = createTestConversation();

            conversation.addTask('task-1');
            conversation.addTask('task-1');

            expect(conversation.taskIds).toEqual(['task-1']);
        });
    });

    describe('archive and reactivate', () => {
        it('should archive an active conversation', () => {
            const conversation = createTestConversation();

            conversation.archive();

            expect(conversation.state).toBe(EntityState.ARCHIVED);
        });

        it('should reactivate an archived conversation', () => {
            const conversation = createTestConversation();

            conversation.archive();
            conversation.reactivate();

            expect(conversation.state).toBe(EntityState.ACTIVE);
        });
    });

    describe('getAgents', () => {
        it('should return only agent participants', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT);
            conversation.addParticipant('user-1', ParticipantType.USER);
            conversation.addParticipant('agent-2', ParticipantType.AGENT);

            const agents = conversation.getAgents();

            expect(agents).toHaveLength(2);
            expect(agents.every((p) => p.type === ParticipantType.AGENT)).toBe(true);
        });
    });

    describe('getUsers', () => {
        it('should return only user participants', () => {
            const conversation = createTestConversation();

            conversation.addParticipant('agent-1', ParticipantType.AGENT);
            conversation.addParticipant('user-1', ParticipantType.USER);
            conversation.addParticipant('user-2', ParticipantType.USER);

            const users = conversation.getUsers();

            expect(users).toHaveLength(2);
            expect(users.every((p) => p.type === ParticipantType.USER)).toBe(true);
        });
    });

    describe('toJSON', () => {
        it('should serialize conversation to JSON', () => {
            const conversation = createTestConversation();
            const json = conversation.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('title');
            expect(json).toHaveProperty('state');
            expect(json).toHaveProperty('participants');
            expect(json).toHaveProperty('messageIds');
            expect(json).toHaveProperty('createdAt');
        });
    });
});
