/**
 * Conversation entity and management
 */

import {
  BaseEntity,
  EntityState,
  ID,
  Metadata,
  Timestamp,
} from "../types/common";

/**
 * Conversation participant type
 */
export enum ParticipantType {
  AGENT = "agent",
  USER = "user",
  SYSTEM = "system",
}

/**
 * Conversation participant
 */
export interface Participant {
  id: ID;
  type: ParticipantType;
  name?: string;
  joinedAt: Timestamp;
  metadata?: Metadata;
}

/**
 * Conversation configuration
 */
export interface ConversationConfig {
  title?: string;
  description?: string;
  participants?: Participant[];
  agentIds?: ID[];
  userIds?: ID[];
  metadata?: Metadata;
}

/**
 * Conversation interface
 */
export interface IConversation extends BaseEntity {
  title?: string;
  description?: string;
  state: EntityState;
  participants: Participant[];
  messageIds: ID[];
  artifactIds: ID[];
  taskIds: ID[];
}

/**
 * Conversation summary
 */
export interface ConversationSummary {
  conversationId: ID;
  title?: string;
  participantCount: number;
  messageCount: number;
  lastMessageAt?: Timestamp;
  lastMessage?: string;
}

/**
 * Conversation class implementation
 */
export class Conversation implements IConversation {
  id: ID;
  title?: string;
  description?: string;
  state: EntityState;
  participants: Participant[];
  messageIds: ID[];
  artifactIds: ID[];
  taskIds: ID[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;

  constructor(config: ConversationConfig = {}, id?: ID) {
    this.id = id || this.generateId();
    this.title = config.title;
    this.description = config.description;
    this.state = EntityState.ACTIVE;
    this.participants = config.participants || [];
    this.messageIds = [];
    this.artifactIds = [];
    this.taskIds = [];
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.metadata = config.metadata;

    // Add agents as participants
    if (config.agentIds) {
      config.agentIds.forEach((agentId) =>
        this.addParticipant(agentId, ParticipantType.AGENT)
      );
    }

    // Add users as participants
    if (config.userIds) {
      config.userIds.forEach((userId) =>
        this.addParticipant(userId, ParticipantType.USER)
      );
    }
  }

  private generateId(): ID {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a participant to the conversation
   */
  addParticipant(
    participantId: ID,
    type: ParticipantType,
    name?: string
  ): void {
    const existing = this.participants.find((p) => p.id === participantId);
    if (!existing) {
      this.participants.push({
        id: participantId,
        type,
        name,
        joinedAt: new Date().toISOString(),
      });
      this.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Remove a participant from the conversation
   */
  removeParticipant(participantId: ID): void {
    this.participants = this.participants.filter((p) => p.id !== participantId);
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Add a message to the conversation
   */
  addMessage(messageId: ID): void {
    this.messageIds.push(messageId);
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Add an artifact to the conversation
   */
  addArtifact(artifactId: ID): void {
    if (!this.artifactIds.includes(artifactId)) {
      this.artifactIds.push(artifactId);
      this.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Add a task to the conversation
   */
  addTask(taskId: ID): void {
    if (!this.taskIds.includes(taskId)) {
      this.taskIds.push(taskId);
      this.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Archive the conversation
   */
  archive(): void {
    this.state = EntityState.ARCHIVED;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Reactivate the conversation
   */
  reactivate(): void {
    this.state = EntityState.ACTIVE;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Update conversation metadata
   */
  updateMetadata(metadata: Metadata): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Get all agent participants
   */
  getAgents(): Participant[] {
    return this.participants.filter((p) => p.type === ParticipantType.AGENT);
  }

  /**
   * Get all user participants
   */
  getUsers(): Participant[] {
    return this.participants.filter((p) => p.type === ParticipantType.USER);
  }

  /**
   * Serialize conversation to JSON
   */
  toJSON(): IConversation {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      state: this.state,
      participants: this.participants,
      messageIds: this.messageIds,
      artifactIds: this.artifactIds,
      taskIds: this.taskIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata,
    };
  }
}
