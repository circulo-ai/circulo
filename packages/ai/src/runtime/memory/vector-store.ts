/**
 * Simple vector store interface and in-memory implementation.
 */

export interface VectorStore {
    upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<void>;
    query(
        query: number[],
        topK: number,
        filter?: Record<string, unknown>
    ): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>;
}

export class InMemoryVectorStore implements VectorStore {
    private readonly store: Map<string, { values: number[]; metadata?: Record<string, unknown> }> = new Map();

    async upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<void> {
        for (const vector of vectors) {
            this.store.set(vector.id, { values: vector.values, metadata: vector.metadata });
        }
    }

    async query(
        query: number[],
        topK: number,
        filter?: Record<string, unknown>
    ): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
        const results: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];
        for (const [id, entry] of this.store.entries()) {
            if (filter && !this.matchesFilter(entry.metadata, filter)) {
                continue;
            }
            const score = this.cosineSimilarity(query, entry.values);
            results.push({ id, score, metadata: entry.metadata });
        }
        return results.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    private matchesFilter(metadata: Record<string, unknown> | undefined, filter: Record<string, unknown>): boolean {
        if (!filter) return true;
        if (!metadata) return false;
        for (const [key, value] of Object.entries(filter)) {
            if (metadata[key] !== value) {
                return false;
            }
        }
        return true;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }
}
