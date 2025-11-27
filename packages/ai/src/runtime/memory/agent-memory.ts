/**
 * Enhanced memory management for agents with RAG support
 */

import { ChatMessage, ExecutionContext, ID, VectorStore } from "../../index.node";

export interface MemoryEntry {
  id: ID;
  agentId: string;
  content: string;
  embedding?: number[];
  type: "conversation" | "knowledge" | "tool_result" | "reflection";
  importance: number; // 0-1 score
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalConfig {
  topK?: number;
  similarityThreshold?: number;
  timeWindow?: { start?: string; end?: string };
  types?: MemoryEntry["type"][];
  includeExpired?: boolean;
}

export interface MemoryManagerConfig {
  shortTermCapacity?: number; // max items in short-term memory
  longTermStore?: VectorStore; // for semantic search
  embeddingModel?: string;
  autoConsolidate?: boolean; // periodically move important memories to long-term
}

export class AgentMemoryManager {
  private readonly shortTerm = new Map<string, MemoryEntry[]>(); // agentId -> memories
  private readonly longTerm?: VectorStore;
  private readonly config: {
    shortTermCapacity: number;
    longTermStore?: VectorStore;
    embeddingModel: string;
    autoConsolidate: boolean;
  };
  private embedder?: (texts: string[]) => Promise<number[][]>;

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      shortTermCapacity: config.shortTermCapacity ?? 50,
      longTermStore: config.longTermStore,
      embeddingModel: config.embeddingModel ?? "text-embedding-3-small",
      autoConsolidate: config.autoConsolidate ?? true,
    };
    this.longTerm = config.longTermStore;
  }

  setEmbedder(embedder: (texts: string[]) => Promise<number[][]>): void {
    this.embedder = embedder;
  }

  /**
   * Store a new memory entry for an agent
   */
  async remember(
    agentId: string,
    entry: Omit<MemoryEntry, "id" | "createdAt" | "agentId">
  ): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
      ...entry,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      createdAt: new Date().toISOString(),
    };

    // Generate embedding if embedder available
    if (this.embedder && !memory.embedding) {
      const [embedding] = await this.embedder([memory.content]);
      memory.embedding = embedding;
    }

    // Add to short-term memory
    const memories = this.shortTerm.get(agentId) ?? [];
    memories.push(memory);
    this.shortTerm.set(agentId, memories);

    // Consolidate if needed
    if (
      this.config.autoConsolidate &&
      memories.length > this.config.shortTermCapacity
    ) {
      await this.consolidate(agentId);
    }

    // Store important memories directly to long-term
    if (memory.importance > 0.7 && this.longTerm && memory.embedding) {
      await this.longTerm.upsert([
        {
          id: memory.id,
          values: memory.embedding,
          metadata: { ...memory, embedding: undefined },
        },
      ]);
    }

    return memory;
  }

  /**
   * Retrieve relevant memories based on query
   */
  async recall(
    agentId: string,
    query: string,
    config: RetrievalConfig = {}
  ): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const now = Date.now();

    // Search short-term memory
    const shortTermMemories = this.shortTerm.get(agentId) ?? [];
    const filteredShortTerm = shortTermMemories.filter((m) => {
      if (
        !config.includeExpired &&
        m.expiresAt &&
        new Date(m.expiresAt).getTime() < now
      ) {
        return false;
      }
      if (config.types && !config.types.includes(m.type)) {
        return false;
      }
      if (config.timeWindow) {
        const created = new Date(m.createdAt).getTime();
        if (
          config.timeWindow.start &&
          created < new Date(config.timeWindow.start).getTime()
        ) {
          return false;
        }
        if (
          config.timeWindow.end &&
          created > new Date(config.timeWindow.end).getTime()
        ) {
          return false;
        }
      }
      return true;
    });

    // Simple text matching for short-term (could be enhanced)
    const queryLower = query.toLowerCase();
    const shortTermMatches = filteredShortTerm
      .filter((m) => m.content.toLowerCase().includes(queryLower))
      .sort((a, b) => b.importance - a.importance);

    results.push(...shortTermMatches);

    // Semantic search in long-term memory if available
    if (this.longTerm && this.embedder) {
      const [queryEmbedding] = await this.embedder([query]);
      const longTermResults = await this.longTerm.query(
        queryEmbedding,
        config.topK ?? 5,
        { agentId }
      );

      const longTermMemories: MemoryEntry[] = [];
      for (const r of longTermResults) {
        if (config.similarityThreshold && r.score < config.similarityThreshold) {
          continue;
        }
        const meta = r.metadata as Partial<MemoryEntry> | undefined;
        if (
          meta &&
          typeof meta.content === "string" &&
          typeof meta.agentId === "string" &&
          typeof meta.type === "string" &&
          typeof meta.importance === "number"
        ) {
          longTermMemories.push(meta as MemoryEntry);
        }
      }

      results.push(...longTermMemories);
    }

    // Deduplicate and sort by importance
    const seen = new Set<string>();
    const unique = results.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return unique
      .sort((a, b) => b.importance - a.importance)
      .slice(0, config.topK ?? 10);
  }

  /**
   * Build context for agent from conversation and memories
   */
  async buildContext(
    agentId: string,
    messages: ChatMessage[],
    ctx: ExecutionContext
  ): Promise<ChatMessage[]> {
    // Extract query from last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return messages;

    const query =
      typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : lastUserMsg.content.find((p) => p.type === "text")?.text ?? "";

    // Retrieve relevant memories
    const memories = await this.recall(agentId, query, {
      topK: 5,
      types: ["knowledge", "tool_result", "reflection"],
    });

    if (memories.length === 0) return messages;

    // Inject memories as system context
    const memoryContext: ChatMessage = {
      role: "system",
      content: `Relevant context from memory:\n\n${memories
        .map(
          (m, i) =>
            `${i + 1}. [${m.type}] ${
              m.content
            } (importance: ${m.importance.toFixed(2)})`
        )
        .join("\n")}`,
      metadata: { source: "memory", memoryIds: memories.map((m) => m.id) },
    };

    // Insert before last user message
    const contextMessages = [...messages];
    contextMessages.splice(messages.length - 1, 0, memoryContext);

    return contextMessages;
  }

  /**
   * Move less important short-term memories to long-term storage
   */
  private async consolidate(agentId: string): Promise<void> {
    const memories = this.shortTerm.get(agentId) ?? [];
    if (memories.length <= this.config.shortTermCapacity || !this.longTerm) {
      return;
    }

    // Sort by importance and keep top N in short-term
    memories.sort((a, b) => b.importance - a.importance);
    const keep = memories.slice(0, this.config.shortTermCapacity);
    const archive = memories.slice(this.config.shortTermCapacity);

    this.shortTerm.set(agentId, keep);

    // Move archived memories to long-term
    if (archive.length > 0 && this.embedder) {
      const textsToEmbed = archive
        .filter((m) => !m.embedding)
        .map((m) => m.content);

      if (textsToEmbed.length > 0) {
        const embeddings = await this.embedder(textsToEmbed);
        let embIdx = 0;
        archive.forEach((m) => {
          if (!m.embedding) {
            m.embedding = embeddings[embIdx++];
          }
        });
      }

      await this.longTerm.upsert(
        archive
          .filter((m) => m.embedding)
          .map((m) => ({
            id: m.id,
            values: m.embedding!,
            metadata: { ...m, embedding: undefined },
          }))
      );
    }
  }

  /**
   * Clear all memories for an agent
   */
  async forget(agentId: string): Promise<void> {
    this.shortTerm.delete(agentId);
    // Note: longTerm vector store doesn't have delete by metadata yet
    // You'd need to implement this in the VectorStore interface
  }

  /**
   * Get memory statistics
   */
  getStats(agentId: string): {
    shortTermCount: number;
    totalImportance: number;
    typeBreakdown: Record<MemoryEntry["type"], number>;
  } {
    const memories = this.shortTerm.get(agentId) ?? [];
    const typeBreakdown = memories.reduce((acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + 1;
      return acc;
    }, {} as Record<MemoryEntry["type"], number>);

    return {
      shortTermCount: memories.length,
      totalImportance: memories.reduce((sum, m) => sum + m.importance, 0),
      typeBreakdown,
    };
  }
}

/**
 * Helper to extract and score importance from agent reflections
 */
export function scoreImportance(
  content: string,
  type: MemoryEntry["type"]
): number {
  let score = 0.5; // base score

  // Boost for certain types
  if (type === "knowledge") score += 0.2;
  if (type === "reflection") score += 0.1;

  // Boost for longer, more detailed content
  if (content.length > 200) score += 0.1;

  // Boost for content with specific markers
  if (content.includes("important") || content.includes("critical"))
    score += 0.15;
  if (content.includes("remember") || content.includes("note")) score += 0.1;

  return Math.min(score, 1.0);
}
