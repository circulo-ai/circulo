/**
 * Artifact representation and management
 */

import { BaseEntity, EntityState, ID, Metadata, Timestamp } from '../types/common';

/**
 * Artifact type
 */
export enum ArtifactType {
    DOCUMENT = 'document',
    IMAGE = 'image',
    VIDEO = 'video',
    AUDIO = 'audio',
    CODE = 'code',
    DATA = 'data',
    MODEL = 'model',
    CUSTOM = 'custom',
}

/**
 * Artifact storage location
 */
export interface ArtifactLocation {
    type: 'url' | 'file' | 'blob' | 'embedded';
    uri: string;
    size?: number;
    mimeType?: string;
}

/**
 * Artifact configuration
 */
export interface ArtifactConfig {
    name: string;
    type: ArtifactType;
    description?: string;
    location: ArtifactLocation;
    creatorId: ID;
    creatorType: 'agent' | 'user' | 'system';
    conversationId?: ID;
    agentIds?: ID[];
    tags?: string[];
    metadata?: Metadata;
}

/**
 * Artifact interface
 */
export interface IArtifact extends BaseEntity {
    name: string;
    type: ArtifactType;
    description?: string;
    state: EntityState;
    location: ArtifactLocation;
    creatorId: ID;
    creatorType: 'agent' | 'user' | 'system';
    conversationId?: ID;
    agentIds: ID[];
    tags: string[];
    version: number;
    parentId?: ID;
    childIds: ID[];
}

/**
 * Artifact class implementation
 */
export class Artifact implements IArtifact {
    id: ID;
    name: string;
    type: ArtifactType;
    description?: string;
    state: EntityState;
    location: ArtifactLocation;
    creatorId: ID;
    creatorType: 'agent' | 'user' | 'system';
    conversationId?: ID;
    agentIds: ID[];
    tags: string[];
    version: number;
    parentId?: ID;
    childIds: ID[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    constructor(config: ArtifactConfig, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.type = config.type;
        this.description = config.description;
        this.state = EntityState.ACTIVE;
        this.location = config.location;
        this.creatorId = config.creatorId;
        this.creatorType = config.creatorType;
        this.conversationId = config.conversationId;
        this.agentIds = config.agentIds || [];
        this.tags = config.tags || [];
        this.version = 1;
        this.childIds = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
    }

    private generateId(): ID {
        return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add an agent association
     */
    addAgent(agentId: ID): void {
        if (!this.agentIds.includes(agentId)) {
            this.agentIds.push(agentId);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Remove an agent association
     */
    removeAgent(agentId: ID): void {
        this.agentIds = this.agentIds.filter((id) => id !== agentId);
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Add a tag
     */
    addTag(tag: string): void {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Remove a tag
     */
    removeTag(tag: string): void {
        this.tags = this.tags.filter((t) => t !== tag);
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Create a new version (child artifact)
     */
    createVersion(updates: Partial<ArtifactConfig>): Artifact {
        const newArtifact = new Artifact({
            name: updates.name || this.name,
            type: updates.type || this.type,
            description: updates.description || this.description,
            location: updates.location || this.location,
            creatorId: updates.creatorId || this.creatorId,
            creatorType: updates.creatorType || this.creatorType,
            conversationId: updates.conversationId || this.conversationId,
            agentIds: updates.agentIds || this.agentIds,
            tags: updates.tags || this.tags,
            metadata: { ...this.metadata, ...updates.metadata },
        });

        newArtifact.parentId = this.id;
        newArtifact.version = this.version + 1;
        this.childIds.push(newArtifact.id);
        this.updatedAt = new Date().toISOString();

        return newArtifact;
    }

    /**
     * Archive the artifact
     */
    archive(): void {
        this.state = EntityState.ARCHIVED;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Delete the artifact
     */
    delete(): void {
        this.state = EntityState.DELETED;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Update location
     */
    updateLocation(location: ArtifactLocation): void {
        this.location = location;
        this.updatedAt = new Date().toISOString();
    }

    /**
     * Serialize artifact to JSON
     */
    toJSON(): IArtifact {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            description: this.description,
            state: this.state,
            location: this.location,
            creatorId: this.creatorId,
            creatorType: this.creatorType,
            conversationId: this.conversationId,
            agentIds: this.agentIds,
            tags: this.tags,
            version: this.version,
            parentId: this.parentId,
            childIds: this.childIds,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}
