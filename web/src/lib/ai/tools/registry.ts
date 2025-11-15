import { chatMemories, chatMemoryEmbeddings, db } from "@/db";
import { tool as toolTable } from "@/db/schema";
import { toolAudit } from "@/lib/ai/tools/tool-audit";
import { toolPermissions } from "@/lib/ai/tools/tool-permissions";
import { createLogger } from "@/lib/logs/console/logger";
import { mcpService } from "@/lib/mcp/service";
import type { McpTool } from "@/lib/mcp/types";
import { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { UIMessageStreamWriter } from "ai";
import { and, eq, sql } from "drizzle-orm";

const logger = createLogger("ToolRegistry");

export type ToolType = "mcp" | "builtin" | "custom" | "api";

export interface ToolCapability {
  category: string;
  tags: string[];
  requiresAuth: boolean;
  supportsStreaming: boolean;
  costTier: "free" | "low" | "medium" | "high";
}

export interface UnifiedTool {
  id: string;
  name: string;
  description: string;
  type: ToolType;
  inputSchema: any;
  capabilities: ToolCapability;
  metadata: {
    serverId?: string;
    serverName?: string;
    version?: string;
    provider?: string;
  };
  isActive: boolean;
  createdAt: Date;
}

export interface ToolExecutionContext {
  userId: string;
  chatId: string;
  agentId?: string;
  parameters: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Tool Adapter Interface - All tools must implement this
 */
export interface ToolAdapter {
  type: ToolType;

  execute(
    tool: UnifiedTool,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;

  validate(
    tool: UnifiedTool,
    parameters: Record<string, any>,
  ): Promise<boolean>;

  getCapabilities(tool: UnifiedTool): ToolCapability;
}

/**
 * MCP Tool Adapter
 */
class McpToolAdapter implements ToolAdapter {
  type: ToolType = "mcp";

  async execute(
    tool: UnifiedTool,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!tool.metadata.serverId) {
        throw new Error("MCP tool missing serverId");
      }

      const result = await mcpService.executeTool(
        context.userId,
        tool.metadata.serverId,
        {
          name: tool.name,
          arguments: context.parameters,
        },
        context.chatId,
      );

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`MCP tool execution failed: ${tool.name}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: Date.now() - startTime,
      };
    }
  }

  async validate(
    tool: UnifiedTool,
    parameters: Record<string, any>,
  ): Promise<boolean> {
    const schema = tool.inputSchema;
    if (!schema || !schema.required) return true;

    for (const requiredField of schema.required) {
      if (!(requiredField in parameters)) {
        return false;
      }
    }

    return true;
  }

  getCapabilities(tool: UnifiedTool): ToolCapability {
    return {
      category: tool.metadata.provider || "external",
      tags: [],
      requiresAuth: true,
      supportsStreaming: false,
      costTier: "medium",
    };
  }
}

/**
 * Built-in Tool Adapter
 */
class BuiltinToolAdapter implements ToolAdapter {
  type: ToolType = "builtin";

  async execute(
    tool: UnifiedTool,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Execute built-in tools (search, memory, documents, etc.)
      const handler = builtinToolHandlers[tool.name];
      if (!handler) {
        throw new Error(`No handler found for built-in tool: ${tool.name}`);
      }

      const result = await handler(context);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`Built-in tool execution failed: ${tool.name}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: Date.now() - startTime,
      };
    }
  }

  async validate(
    tool: UnifiedTool,
    parameters: Record<string, any>,
  ): Promise<boolean> {
    return true; // Built-in tools have validated schemas
  }

  getCapabilities(tool: UnifiedTool): ToolCapability {
    return {
      category: "builtin",
      tags: ["system"],
      requiresAuth: false,
      supportsStreaming: true,
      costTier: "low",
    };
  }
}

// Built-in tool handlers map
const builtinToolHandlers: Record<
  string,
  (context: ToolExecutionContext) => Promise<any>
> = {
  // Memory Tools
  searchChatMemory: async (context: ToolExecutionContext) => {
    const { userId, chatId, parameters } = context;
    const { query, limit = 5 } = parameters;

    if (!query) {
      throw new Error("Query parameter is required");
    }

    // TODO: Generate query embedding
    const queryEmbedding: number[] = []; // await embedText(query);

    // Semantic search via pgvector
    const rows: any[] = await db.execute(sql`
      SELECT m.id,
             m.type,
             m.content,
             m.metadata,
             (me.embedding < - > ${queryEmbedding}::vector) AS distance
      FROM chat_memory_embeddings me
             JOIN chat_memories m ON m.id = me.memory_id
      WHERE m.owner_id = ${userId}
        AND m.chat_id = ${chatId}
        AND m.deleted = false
      ORDER BY distance ASC
        LIMIT ${limit};
    `);

    const results = rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: row.metadata,
      score: 1 - row.distance,
    }));

    return {
      query,
      results,
    };
  },

  saveChatMemory: async (context: ToolExecutionContext) => {
    const { userId, chatId, agentId, parameters } = context;
    const { type, content, metadata = {}, embed = true } = parameters;

    if (!type || !content) {
      throw new Error("Type and content are required");
    }

    const memoryId = generateUUID();
    const now = new Date();

    // Insert memory
    await db.insert(chatMemories).values({
      id: memoryId,
      chatId,
      ownerId: userId,
      agentId: agentId || null,
      type,
      content,
      metadata,
      createdAt: now,
    });

    // Optional embedding
    if (embed) {
      // TODO: Generate embeddings using openai embedding model
      const embedding: number[] = []; // await embedText(content);

      if (embedding.length > 0) {
        await db.insert(chatMemoryEmbeddings).values({
          memoryId,
          embedding,
        });
      }
    }

    return {
      id: memoryId,
      type,
      content,
      message: "Memory saved successfully",
    };
  },

  // Document Tools
  createDocument: async (context: ToolExecutionContext) => {
    const { userId, chatId, parameters, metadata } = context;
    const { title, kind } = parameters;

    if (!title || !kind) {
      throw new Error("Title and kind are required");
    }

    const documentId = generateUUID();

    // Get the dataStream from metadata if available
    const dataStream = metadata?.dataStream as
      | UIMessageStreamWriter<ChatMessage>
      | undefined;

    if (dataStream) {
      // Send document creation events to stream
      dataStream.write({
        type: "data-kind",
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: documentId,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });
    }

    // TODO: Call the actual document handler based on kind
    // const documentHandler = documentHandlersByArtifactKind.find(
    //   (h) => h.kind === kind
    // );
    // if (documentHandler) {
    //   await documentHandler.onCreateDocument({
    //     id: documentId,
    //     title,
    //     dataStream,
    //     session: { user: { id: userId } },
    //   });
    // }

    if (dataStream) {
      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });
    }

    return {
      id: documentId,
      title,
      kind,
      content: "A document was created and is now visible to the user.",
    };
  },

  updateDocument: async (context: ToolExecutionContext) => {
    const { userId, parameters, metadata } = context;
    const { id, description } = parameters;

    if (!id || !description) {
      throw new Error("Document id and description are required");
    }

    // Get document from database
    const document = await db.query.document.findFirst({
      where: (documents, { eq }) => eq(documents.id, id),
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const dataStream = metadata?.dataStream as
      | UIMessageStreamWriter<ChatMessage>
      | undefined;

    if (dataStream) {
      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });
    }

    // TODO: Call the actual document handler based on kind
    // const documentHandler = documentHandlersByArtifactKind.find(
    //   (h) => h.kind === document.kind
    // );
    // if (documentHandler) {
    //   await documentHandler.onUpdateDocument({
    //     document,
    //     description,
    //     dataStream,
    //     session: { user: { id: userId } },
    //   });
    // }

    if (dataStream) {
      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });
    }

    return {
      id,
      title: document.title,
      kind: document.kind,
      content: "The document has been updated successfully.",
    };
  },

  requestSuggestions: async (context: ToolExecutionContext) => {
    const { userId, parameters } = context;
    const { documentId } = parameters;

    if (!documentId) {
      throw new Error("Document id is required");
    }

    const document = await db.query.document.findFirst({
      where: (documents, { eq }) => eq(documents.id, documentId),
    });

    if (!document || !document.content) {
      throw new Error("Document not found or has no content");
    }

    // TODO: Call AI to generate suggestions
    // This would use streamObject to generate suggestions
    // For now, return a placeholder

    return {
      id: documentId,
      title: document.title,
      kind: document.kind,
      message: "Suggestions generation started",
    };
  },

  // Web Search Tool (if you have it)
  webSearch: async (context: ToolExecutionContext) => {
    const { parameters } = context;
    const { query, limit = 10 } = parameters;

    if (!query) {
      throw new Error("Query parameter is required");
    }

    // TODO: Implement web search
    // This would use your web search API
    throw new Error("Web search not implemented");
  },

  // File Operations
  readFile: async (context: ToolExecutionContext) => {
    const { parameters } = context;
    const { path } = parameters;

    if (!path) {
      throw new Error("File path is required");
    }

    // Read file using window.fs.readFile if in browser context
    // Or implement server-side file reading
    throw new Error("File reading not implemented");
  },

  // Knowledge Base Tools
  searchKnowledgeBase: async (context: ToolExecutionContext) => {
    const { userId, parameters } = context;
    const { knowledgeBaseId, query, limit = 5 } = parameters;

    if (!knowledgeBaseId || !query) {
      throw new Error("Knowledge base id and query are required");
    }

    // TODO: Implement knowledge base search
    // This would search embeddings in the knowledge base
    throw new Error("Knowledge base search not implemented");
  },
};

/**
 * Central Tool Registry
 */
class ToolRegistry {
  private adapters = new Map<ToolType, ToolAdapter>();
  private toolCache = new Map<string, UnifiedTool>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Register adapters
    this.registerAdapter(new McpToolAdapter());
    this.registerAdapter(new BuiltinToolAdapter());
  }

  registerAdapter(adapter: ToolAdapter): void {
    this.adapters.set(adapter.type, adapter);
    logger.info(`Registered tool adapter: ${adapter.type}`);
  }

  /**
   * Discover all available tools for a user/workspace
   */
  async discoverTools(
    userId: string,
    chatId: string,
    options: {
      includeBuiltin?: boolean;
      includeMcp?: boolean;
      includeCustom?: boolean;
    } = {},
  ): Promise<UnifiedTool[]> {
    const {
      includeBuiltin = true,
      includeMcp = true,
      includeCustom = true,
    } = options;

    const tools: UnifiedTool[] = [];

    // Get built-in tools
    if (includeBuiltin) {
      const builtinTools = await this.getBuiltinTools();
      tools.push(...builtinTools);
    }

    // Get MCP tools
    if (includeMcp) {
      try {
        const mcpTools = await mcpService.discoverTools(userId, chatId);
        const unifiedMcpTools = mcpTools.map(this.convertMcpToUnified);
        tools.push(...unifiedMcpTools);
      } catch (error) {
        logger.error("Failed to discover MCP tools", error);
      }
    }

    // Get custom tools from database
    if (includeCustom) {
      const customTools = await this.getCustomTools(userId);
      tools.push(...customTools);
    }

    return tools;
  }

  /**
   * Get tools available to a specific agent
   */
  async getAgentTools(agentId: string, chatId: string): Promise<UnifiedTool[]> {
    // Get agent configuration including toolIds
    const agent = await db.query.agent.findFirst({
      where: (agents, { eq }) => eq(agents.id, agentId),
    });

    if (!agent || !agent.toolIds || agent.toolIds.length === 0) {
      return [];
    }

    const tools: UnifiedTool[] = [];

    for (const toolId of agent.toolIds) {
      const tool = await this.getTool(toolId, agent.userId, chatId);
      if (tool && tool.isActive) {
        tools.push(tool);
      }
    }

    return tools;
  }

  /**
   * Get a specific tool by ID
   */
  async getTool(
    toolId: string,
    userId: string,
    chatId: string,
  ): Promise<UnifiedTool | null> {
    // Check cache first
    const cached = this.toolCache.get(toolId);
    if (cached) {
      return cached;
    }

    // Try to find in database
    const [dbTool] = await db
      .select()
      .from(toolTable)
      .where(and(eq(toolTable.id, toolId), eq(toolTable.isActive, true)))
      .limit(1);

    if (dbTool) {
      const unified = this.convertDbToUnified(dbTool);
      this.toolCache.set(toolId, unified);
      return unified;
    }

    // Check if it's an MCP tool
    const allMcpTools = await mcpService.discoverTools(userId, chatId);
    const mcpTool = allMcpTools.find((t) => t.name === toolId);
    if (mcpTool) {
      const unified = this.convertMcpToUnified(mcpTool);
      this.toolCache.set(toolId, unified);
      return unified;
    }

    return null;
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolId: string,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    const tool = await this.getTool(toolId, context.userId, context.chatId);
    if (!tool) {
      const result = {
        success: false,
        error: `Tool not found: ${toolId}`,
        executionTime: 0,
      };

      // Audit failed execution
      await toolAudit.log({
        userId: context.userId,
        agentId: context.agentId,
        chatId: context.chatId,
        toolId,
        toolName: toolId,
        toolType: "unknown",
        parameters: context.parameters,
        result,
        executionTime: 0,
      });

      return result;
    }

    // Check permissions
    const permissionCheck = await toolPermissions.canExecuteTool(
      context.userId,
      toolId,
    );

    if (!permissionCheck.allowed) {
      const result = {
        success: false,
        error: permissionCheck.reason || "Permission denied",
        executionTime: Date.now() - startTime,
      };

      await toolAudit.log({
        userId: context.userId,
        agentId: context.agentId,
        chatId: context.chatId,
        toolId: tool.id,
        toolName: tool.name,
        toolType: tool.type,
        parameters: context.parameters,
        result,
        executionTime: result.executionTime,
      });

      return result;
    }

    const adapter = this.adapters.get(tool.type);
    if (!adapter) {
      const result = {
        success: false,
        error: `No adapter found for tool type: ${tool.type}`,
        executionTime: Date.now() - startTime,
      };

      await toolAudit.log({
        userId: context.userId,
        agentId: context.agentId,
        chatId: context.chatId,
        toolId: tool.id,
        toolName: tool.name,
        toolType: tool.type,
        parameters: context.parameters,
        result,
        executionTime: result.executionTime,
      });

      return result;
    }

    // Validate parameters
    const isValid = await adapter.validate(tool, context.parameters);
    if (!isValid) {
      const result = {
        success: false,
        error: "Invalid parameters for tool",
        executionTime: Date.now() - startTime,
      };

      await toolAudit.log({
        userId: context.userId,
        agentId: context.agentId,
        chatId: context.chatId,
        toolId: tool.id,
        toolName: tool.name,
        toolType: tool.type,
        parameters: context.parameters,
        result,
        executionTime: result.executionTime,
      });

      return result;
    }

    // Execute
    const result = await adapter.execute(tool, context);

    // Track execution for rate limiting
    toolPermissions.trackExecution(context.userId, toolId);

    // Audit execution
    await toolAudit.log({
      userId: context.userId,
      agentId: context.agentId,
      chatId: context.chatId,
      toolId: tool.id,
      toolName: tool.name,
      toolType: tool.type,
      parameters: context.parameters,
      result: {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.error,
      },
      executionTime: result.executionTime,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });

    return result;
  }

  /**
   * Search tools by capability/category
   */
  async searchTools(
    userId: string,
    chatId: string,
    query: {
      category?: string;
      tags?: string[];
      requiresAuth?: boolean;
      costTier?: string;
    },
  ): Promise<UnifiedTool[]> {
    const allTools = await this.discoverTools(userId, chatId);

    return allTools.filter((tool) => {
      if (query.category && tool.capabilities.category !== query.category) {
        return false;
      }
      if (
        query.tags &&
        !query.tags.some((tag) => tool.capabilities.tags.includes(tag))
      ) {
        return false;
      }
      if (
        query.requiresAuth !== undefined &&
        tool.capabilities.requiresAuth !== query.requiresAuth
      ) {
        return false;
      }
      if (query.costTier && tool.capabilities.costTier !== query.costTier) {
        return false;
      }
      return true;
    });
  }

  private async getBuiltinTools(): Promise<UnifiedTool[]> {
    return [
      {
        id: "searchChatMemory",
        name: "searchChatMemory",
        description: "Search through chat memories",
        type: "builtin",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
        capabilities: {
          category: "memory",
          tags: ["search", "rag"],
          requiresAuth: false,
          supportsStreaming: false,
          costTier: "low",
        },
        metadata: { version: "1.0.0" },
        isActive: true,
        createdAt: new Date(),
      },
      // Add other built-in tools...
    ];
  }

  private async getCustomTools(userId: string): Promise<UnifiedTool[]> {
    const tools = await db
      .select()
      .from(toolTable)
      .where(
        and(
          eq(toolTable.userId, userId),
          eq(toolTable.isActive, true),
          eq(toolTable.isSystem, false),
        ),
      );

    return tools.map(this.convertDbToUnified);
  }

  private convertMcpToUnified(mcpTool: McpTool): UnifiedTool {
    return {
      id: `mcp-${mcpTool.serverId}-${mcpTool.name}`,
      name: mcpTool.name,
      description: mcpTool.description ?? "", // Handle null
      type: "mcp",
      inputSchema: mcpTool.inputSchema,
      capabilities: {
        category: "external",
        tags: [],
        requiresAuth: true,
        supportsStreaming: false,
        costTier: "medium",
      },
      metadata: {
        serverId: mcpTool.serverId,
        serverName: mcpTool.serverName,
      },
      isActive: true,
      createdAt: new Date(),
    };
  }

  private convertDbToUnified(dbTool: any): UnifiedTool {
    return {
      id: dbTool.id,
      name: dbTool.name,
      description: dbTool.description ?? "", // Handle null
      type: dbTool.type as ToolType,
      inputSchema: dbTool.configuration,
      capabilities: {
        category: "custom",
        tags: [],
        requiresAuth: false,
        supportsStreaming: false,
        costTier: "medium",
      },
      metadata: {},
      isActive: dbTool.isActive,
      createdAt: dbTool.createdAt,
    };
  }

  clearCache(): void {
    this.toolCache.clear();
  }
}

export const toolRegistry = new ToolRegistry();
