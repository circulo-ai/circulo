/**
 * Knowledge Base and Memory Management
 */

import { BaseEntity, EntityState, ID, Metadata, Timestamp } from '../types/common';

/**
 * Document type
 */
export enum DocumentType {
    TEXT = 'text',
    PDF = 'pdf',
    HTML = 'html',
    MARKDOWN = 'markdown',
    CODE = 'code',
    JSON = 'json',
    CUSTOM = 'custom',
}

/**
 * Document interface
 */
export interface Document {
    id: ID;
    title?: string;
    content: string;
    type: DocumentType;
    source?: string;
    metadata?: Metadata;
    createdAt: Timestamp;
}

/**
 * Embedding vector
 */
export interface Embedding {
    id: ID;
    documentId: ID;
    vector: number[];
    chunkIndex?: number;
    metadata?: Metadata;
}

/**
 * Search result
 */
export interface SearchResult {
    documentId: ID;
    score: number;
    content: string;
    metadata?: Metadata;
}

/**
 * Knowledge base driver interface for pluggable storage
 */
export interface KnowledgeBaseDriver {
    /**
     * Initialize the driver
     */
    initialize(): Promise<void>;

    /**
     * Store a document
     */
    storeDocument(document: Document): Promise<ID>;

    /**
     * Retrieve a document by ID
     */
    getDocument(id: ID): Promise<Document | null>;

    /**
     * Delete a document
     */
    deleteDocument(id: ID): Promise<boolean>;

    /**
     * Store an embedding
     */
    storeEmbedding(embedding: Embedding): Promise<void>;

    /**
     * Search by vector similarity
     */
    searchByVector(vector: number[], limit?: number, threshold?: number): Promise<SearchResult[]>;

    /**
     * Search by text query
     */
    searchByText(query: string, limit?: number): Promise<SearchResult[]>;

    /**
     * List all documents
     */
    listDocuments(filter?: Record<string, unknown>): Promise<Document[]>;

    /**
     * Clear all data
     */
    clear(): Promise<void>;
}

/**
 * Knowledge base configuration
 */
export interface KnowledgeBaseConfig {
    name: string;
    description?: string;
    driver: KnowledgeBaseDriver;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    metadata?: Metadata;
}

/**
 * Knowledge base interface
 */
export interface IKnowledgeBase extends BaseEntity {
    name: string;
    description?: string;
    state: EntityState;
    embeddingModel?: string;
    chunkSize: number;
    chunkOverlap: number;
    documentCount: number;
}

/**
 * Knowledge base class implementation
 */
export class KnowledgeBase implements IKnowledgeBase {
    id: ID;
    name: string;
    description?: string;
    state: EntityState;
    embeddingModel?: string;
    chunkSize: number;
    chunkOverlap: number;
    documentCount: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata?: Metadata;

    private driver: KnowledgeBaseDriver;
    private initialized: boolean = false;

    constructor(config: KnowledgeBaseConfig, id?: ID) {
        this.id = id || this.generateId();
        this.name = config.name;
        this.description = config.description;
        this.state = EntityState.CREATED;
        this.embeddingModel = config.embeddingModel;
        this.chunkSize = config.chunkSize || 512;
        this.chunkOverlap = config.chunkOverlap || 50;
        this.documentCount = 0;
        this.createdAt = new Date().toISOString();
        this.updatedAt = this.createdAt;
        this.metadata = config.metadata;
        this.driver = config.driver;
    }

    private generateId(): ID {
        return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize the knowledge base
     */
    async initialize(): Promise<void> {
        if (!this.initialized) {
            await this.driver.initialize();
            this.initialized = true;
            this.state = EntityState.ACTIVE;
            this.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Add a document to the knowledge base
     */
    async addDocument(document: Omit<Document, 'id' | 'createdAt'>): Promise<ID> {
        this.ensureInitialized();

        const fullDocument: Document = {
            ...document,
            id: this.generateDocumentId(),
            createdAt: new Date().toISOString(),
        };

        const docId = await this.driver.storeDocument(fullDocument);
        this.documentCount++;
        this.updatedAt = new Date().toISOString();

        return docId;
    }

    /**
     * Get a document by ID
     */
    async getDocument(id: ID): Promise<Document | null> {
        this.ensureInitialized();
        return this.driver.getDocument(id);
    }

    /**
     * Delete a document
     */
    async deleteDocument(id: ID): Promise<boolean> {
        this.ensureInitialized();
        const deleted = await this.driver.deleteDocument(id);
        if (deleted) {
            this.documentCount = Math.max(0, this.documentCount - 1);
            this.updatedAt = new Date().toISOString();
        }
        return deleted;
    }

    /**
     * Store an embedding
     */
    async storeEmbedding(embedding: Embedding): Promise<void> {
        this.ensureInitialized();
        await this.driver.storeEmbedding(embedding);
    }

    /**
     * Search by vector
     */
    async searchByVector(vector: number[], limit: number = 10, threshold: number = 0.7): Promise<SearchResult[]> {
        this.ensureInitialized();
        return this.driver.searchByVector(vector, limit, threshold);
    }

    /**
     * Search by text query
     */
    async searchByText(query: string, limit: number = 10): Promise<SearchResult[]> {
        this.ensureInitialized();
        return this.driver.searchByText(query, limit);
    }

    /**
     * List all documents
     */
    async listDocuments(filter?: Record<string, unknown>): Promise<Document[]> {
        this.ensureInitialized();
        return this.driver.listDocuments(filter);
    }

    /**
     * Clear all documents
     */
    async clear(): Promise<void> {
        this.ensureInitialized();
        await this.driver.clear();
        this.documentCount = 0;
        this.updatedAt = new Date().toISOString();
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('Knowledge base not initialized. Call initialize() first.');
        }
    }

    private generateDocumentId(): ID {
        return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Serialize knowledge base to JSON
     */
    toJSON(): IKnowledgeBase {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            state: this.state,
            embeddingModel: this.embeddingModel,
            chunkSize: this.chunkSize,
            chunkOverlap: this.chunkOverlap,
            documentCount: this.documentCount,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
        };
    }
}

/**
 * In-memory knowledge base driver implementation
 */
export class InMemoryKnowledgeBaseDriver implements KnowledgeBaseDriver {
    private documents: Map<ID, Document> = new Map();
    private embeddings: Map<ID, Embedding> = new Map();

    async initialize(): Promise<void> {
        // No-op for in-memory
    }

    async storeDocument(document: Document): Promise<ID> {
        this.documents.set(document.id, document);
        return document.id;
    }

    async getDocument(id: ID): Promise<Document | null> {
        return this.documents.get(id) || null;
    }

    async deleteDocument(id: ID): Promise<boolean> {
        return this.documents.delete(id);
    }

    async storeEmbedding(embedding: Embedding): Promise<void> {
        this.embeddings.set(embedding.id, embedding);
    }

    async searchByVector(vector: number[], limit: number = 10, threshold: number = 0.7): Promise<SearchResult[]> {
        const results: SearchResult[] = [];

        for (const embedding of this.embeddings.values()) {
            const score = this.cosineSimilarity(vector, embedding.vector);
            if (score >= threshold) {
                const document = this.documents.get(embedding.documentId);
                if (document) {
                    results.push({
                        documentId: document.id,
                        score,
                        content: document.content,
                        metadata: document.metadata,
                    });
                }
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    async searchByText(query: string, limit: number = 10): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();

        for (const document of this.documents.values()) {
            const contentLower = document.content.toLowerCase();
            if (contentLower.includes(queryLower)) {
                results.push({
                    documentId: document.id,
                    score: 1.0,
                    content: document.content,
                    metadata: document.metadata,
                });
            }
        }

        return results.slice(0, limit);
    }

    async listDocuments(filter?: Record<string, unknown>): Promise<Document[]> {
        const docs = Array.from(this.documents.values());

        if (!filter) {
            return docs;
        }

        return docs.filter((doc) => {
            for (const [key, value] of Object.entries(filter)) {
                if (doc.metadata?.[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    async clear(): Promise<void> {
        this.documents.clear();
        this.embeddings.clear();
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
