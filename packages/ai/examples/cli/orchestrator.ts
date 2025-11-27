/**
 * Complete orchestrator implementation
 * Place in: examples/cli/orchestrator.ts
 */

import { generateText, streamText } from "ai";
import { google } from "@ai-sdk/google";

import {
  AdaptiveOrchestrator,
  VercelAISDKAdapter,
  ChatMessage,
  ChatOptions,
  AgentDefinition,
  AgentRuntime,
  AgentInput,
  AgentActResult,
  ExecutionContext,
  OrchestrationContext,
  MiddlewarePipeline,
  ToolRegistry,
  SDKFunctionTool,
  ToolSchema,
  HumanApprovalManager,
} from "../../src";

import { AgentMemoryManager } from "../../src/runtime/memory/agent-memory";
import { ResilientExecutor } from "../../src/runtime/resilience/executor";
import { StorageManager } from "./storage";

export interface OrchestratorConfig {
  storage: StorageManager;
  config: {
    defaultModel: string;
    defaultProvider: "google" | "gemini" | "openai" | "anthropic";
    maxRetries: number;
  };
  approvalManager?: HumanApprovalManager;
}

export class AgentOrchestrator {
  private orchestrator: AdaptiveOrchestrator;
  private llmAdapter: VercelAISDKAdapter;
  private toolRegistry: ToolRegistry;
  private middleware: MiddlewarePipeline;
  private memory: AgentMemoryManager;
  private resilient: ResilientExecutor;
  private agents: Map<string, AgentRuntime> = new Map();
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;

    // Initialize memory with vector store
    this.memory = new AgentMemoryManager({
      longTermStore: config.storage.getVectorStore(),
      autoConsolidate: true,
    });

    // Set embedder
    this.memory.setEmbedder(async (texts) => {
      // Use OpenAI embeddings
      const { embeddings } = await google
        .embedding("text-embedding-004")
        .doEmbed({
          values: texts,
        });
      return embeddings;
    });

    // Initialize resilient executor
    this.resilient = new ResilientExecutor();

    // Initialize middleware
    this.middleware = new MiddlewarePipeline();
    this.setupMiddleware();

    // Initialize tool registry
    this.toolRegistry = new ToolRegistry();

    // Initialize LLM adapter
    const provider = google;
    const mapUsage = (usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }) =>
      usage
        ? {
            promptTokens: usage.promptTokens ?? 0,
            completionTokens: usage.completionTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          }
        : undefined;

    const toChatToolCall = (
      call: {
        toolCallId?: string;
        toolName?: string;
        input?: unknown;
        id?: string;
      },
      idx: number
    ) => ({
      id: call.toolCallId || call.id || `tool_call_${idx}`,
      name: call.toolName || "tool",
      arguments:
        call.input && typeof call.input === "object"
          ? (call.input as Record<string, unknown>)
          : { input: call.input },
    });

    const toAIMessages = (messages: ChatMessage[]) =>
      messages.map((m) => {
        // The Vercel AI SDK expects ModelMessages; keep them simple (strings) for compatibility.
        const text =
          typeof m.content === "string"
            ? m.content
            : m.content
                .map((part) =>
                  part.type === "text" && part.text ? part.text : ""
                )
                .filter(Boolean)
                .join("\n");

        // Avoid sending tool messages with incomplete shape; coerce to assistant text instead.
        const role =
          m.role === "tool"
            ? "assistant"
            : m.role === "assistant" || m.role === "system" || m.role === "user"
            ? m.role
            : "assistant";

        return { role, content: text };
      });

    this.llmAdapter = new VercelAISDKAdapter(
      {
        streamText: (params) => {
          const result = streamText({
            model: provider(this.config.config.defaultModel),
            messages: toAIMessages(params.messages) as any,
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
          });

          return {
            toAIStreamResponse: async function* () {
              let chunkIdx = 0;
              for await (const part of result.fullStream) {
                if (
                  part?.type === "text-delta" &&
                  typeof part.text === "string"
                ) {
                  yield { text: part.text };
                } else if (part?.type === "tool-call") {
                  yield {
                    text: "",
                    toolCalls: [toChatToolCall(part, chunkIdx++)],
                  };
                }
              }

              try {
                const usage = await result.totalUsage;
                const mapped = mapUsage(usage);
                if (mapped) {
                  yield { text: "", usage: mapped };
                }
              } catch {
                // Ignore usage errors for streaming
              }
            },
          };
        },
        generateText: async (params) => {
          const res = await generateText({
            model: provider(this.config.config.defaultModel),
            messages: toAIMessages(params.messages) as any,
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
          });

          return {
            text: res.text,
            toolCalls: res.toolCalls?.map((call, idx) =>
              toChatToolCall(call, idx)
            ),
            usage: mapUsage(res.usage),
          };
        },
      },
      (usage) => {
        // Track token usage
        if (usage) {
          this.config.storage.recordTokenUsage({
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          });
        }
      }
    );

    // Initialize orchestrator
    this.orchestrator = new AdaptiveOrchestrator({
      strategy: "sequential",
      middleware: this.middleware,
      approvals: config.approvalManager,
    });
  }

  private setupMiddleware(): void {
    // Logging middleware
    this.middleware.use({
      beforePrompt: async (ctx, messages, opts) => {
        console.log(
          `[${ctx.requestId}] Sending ${messages.length} messages to ${opts.model}`
        );
      },
      afterPrompt: async (ctx, result) => {
        console.log(
          `[${ctx.requestId}] Received completion with ${result.messages.length} messages`
        );
      },
      beforeTool: async (ctx, params) => {
        console.log(`[${ctx.requestId}] Executing tool: ${ctx.toolName}`);
      },
      afterTool: async (ctx, result) => {
        console.log(`[${ctx.requestId}] Tool ${ctx.toolName} completed`);
      },
      onError: async (ctx, error) => {
        console.error(`[${ctx.requestId}] Error:`, error);
      },
    });

    // Memory middleware - inject context
    this.middleware.use({
      beforePrompt: async (ctx, messages) => {
        if (ctx.userId) {
          // Build context from memory
          const enrichedMessages = await this.memory.buildContext(
            ctx.userId,
            messages,
            ctx
          );
          messages.splice(0, messages.length, ...enrichedMessages);
        }
      },
      afterPrompt: async (ctx, result) => {
        // Store assistant response in memory
        if (ctx.userId && result.messages.length > 0) {
          const lastMsg = result.messages[result.messages.length - 1];
          if (
            lastMsg.role === "assistant" &&
            typeof lastMsg.content === "string"
          ) {
            await this.memory.remember(ctx.userId, {
              content: lastMsg.content,
              type: "conversation",
              importance: 0.5,
            });
          }
        }
      },
    });
  }

  async initialize(): Promise<void> {
    // Register default agents
    await this.registerDefaultAgents();

    // Register default tools
    await this.registerDefaultTools();
  }

  private async registerDefaultAgents(): Promise<void> {
    // Research Agent
    const researchDefinition: AgentDefinition = {
      id: "research-agent",
      name: "Research Agent",
      description: "Specializes in research, data gathering, and analysis",
      systemPrompt: `You are a research specialist. Your role is to:
- Gather information from multiple sources
- Analyze and synthesize data
- Provide well-researched answers with citations
- Use available tools to enhance research quality`,
      model: this.config.config.defaultModel,
      toolNames: ["web_search", "file_search", "calculator"],
    };
    const researchAgent: AgentRuntime = {
      definition: researchDefinition,
      act: async (
        input: AgentInput,
        ctx: ExecutionContext
      ): Promise<AgentActResult> => {
        return this.resilient.execute(
          `agent-${researchDefinition.id}`,
          async () => {
            const messages: ChatMessage[] = [
              {
                role: "system",
                content: researchDefinition.systemPrompt || "",
              },
              ...input.messages,
            ];

            const result = await this.llmAdapter.chat(
              messages,
              {
                model:
                  researchDefinition.model || this.config.config.defaultModel,
                temperature: 0.7,
                maxTokens: 2000,
              },
              ctx
            );

            const lastMsg = result.messages[result.messages.length - 1];
            return {
              completion:
                typeof lastMsg.content === "string" ? lastMsg.content : "",
              toolCalls: result.toolCalls,
              confidence: 0.85,
            };
          },
          {
            retry: { maxAttempts: this.config.config.maxRetries },
            timeout: { timeoutMs: 60000 },
            circuitBreaker: { failureThreshold: 3 },
          }
        );
      },
    };

    // Code Agent
    const codeDefinition: AgentDefinition = {
      id: "code-agent",
      name: "Code Agent",
      description:
        "Specializes in code generation, debugging, and technical tasks",
      systemPrompt: `You are a coding specialist. Your role is to:
- Write clean, efficient, and well-documented code
- Debug and fix code issues
- Explain technical concepts clearly
- Follow best practices and design patterns`,
      model: this.config.config.defaultModel,
      toolNames: ["file_search", "calculator"],
    };
    const codeAgent: AgentRuntime = {
      definition: codeDefinition,
      act: async (
        input: AgentInput,
        ctx: ExecutionContext
      ): Promise<AgentActResult> => {
        return this.resilient.execute(
          `agent-${codeDefinition.id}`,
          async () => {
            const messages: ChatMessage[] = [
              { role: "system", content: codeDefinition.systemPrompt || "" },
              ...input.messages,
            ];

            const result = await this.llmAdapter.chat(
              messages,
              {
                model: codeDefinition.model || this.config.config.defaultModel,
                temperature: 0.3, // Lower temperature for code
                maxTokens: 3000,
              },
              ctx
            );

            const lastMsg = result.messages[result.messages.length - 1];
            return {
              completion:
                typeof lastMsg.content === "string" ? lastMsg.content : "",
              toolCalls: result.toolCalls,
              confidence: 0.9,
            };
          },
          {
            retry: { maxAttempts: this.config.config.maxRetries },
            timeout: { timeoutMs: 90000 },
          }
        );
      },
    };

    // Analysis Agent
    const analysisDefinition: AgentDefinition = {
      id: "analysis-agent",
      name: "Analysis Agent",
      description:
        "Specializes in data analysis, pattern recognition, and insights",
      systemPrompt: `You are an analysis specialist. Your role is to:
- Analyze data and identify patterns
- Generate insights and recommendations
- Create clear visualizations and summaries
- Support data-driven decision making`,
      model: this.config.config.defaultModel,
      toolNames: ["calculator", "file_search"],
    };
    const analysisAgent: AgentRuntime = {
      definition: analysisDefinition,
      act: async (
        input: AgentInput,
        ctx: ExecutionContext
      ): Promise<AgentActResult> => {
        return this.resilient.execute(
          `agent-${analysisDefinition.id}`,
          async () => {
            const messages: ChatMessage[] = [
              {
                role: "system",
                content: analysisDefinition.systemPrompt || "",
              },
              ...input.messages,
            ];

            const result = await this.llmAdapter.chat(
              messages,
              {
                model:
                  analysisDefinition.model || this.config.config.defaultModel,
                temperature: 0.5,
                maxTokens: 2500,
              },
              ctx
            );

            const lastMsg = result.messages[result.messages.length - 1];
            return {
              completion:
                typeof lastMsg.content === "string" ? lastMsg.content : "",
              toolCalls: result.toolCalls,
              confidence: 0.8,
            };
          },
          {
            retry: { maxAttempts: this.config.config.maxRetries },
            timeout: { timeoutMs: 60000 },
          }
        );
      },
    };

    // Register agents
    this.agents.set(researchAgent.definition.id, researchAgent);
    this.agents.set(codeAgent.definition.id, codeAgent);
    this.agents.set(analysisAgent.definition.id, analysisAgent);

    this.orchestrator.registerAgent(researchAgent);
    this.orchestrator.registerAgent(codeAgent);
    this.orchestrator.registerAgent(analysisAgent);
  }

  private async registerDefaultTools(): Promise<void> {
    // Calculator tool
    const calculatorTool = new SDKFunctionTool(
      {
        name: "calculator",
        description: "Performs mathematical calculations",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Mathematical expression to evaluate",
            },
          },
          required: ["expression"],
        },
      },
      async (params: { expression: string }) => {
        try {
          // Simple eval for demo (in production, use a proper math parser)
          const result = Function(
            `'use strict'; return (${params.expression})`
          )();
          return { result, expression: params.expression };
        } catch (error) {
          throw new Error(`Invalid expression: ${params.expression}`);
        }
      }
    );

    // File search tool
    const fileSearchTool = new SDKFunctionTool(
      {
        name: "file_search",
        description: "Searches for files and reads their content",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "File pattern to search for (glob)",
            },
            directory: {
              type: "string",
              description: "Directory to search in",
            },
          },
          required: ["pattern"],
        },
      },
      async (params: { pattern: string; directory?: string }) => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const glob = (await import("glob")).glob;

        const searchDir = params.directory || process.cwd();
        const files = await glob(params.pattern, { cwd: searchDir });

        const results = [];
        for (const file of files.slice(0, 10)) {
          // Limit to 10 files
          try {
            const fullPath = path.join(searchDir, file);
            const content = await fs.readFile(fullPath, "utf-8");
            results.push({
              path: file,
              size: content.length,
              preview: content.substring(0, 500),
            });
          } catch (error) {
            // Skip files that can't be read
          }
        }

        return { files: results, totalFound: files.length };
      }
    );

    // Register tools
    this.toolRegistry.register(calculatorTool);
    this.toolRegistry.register(fileSearchTool);

    this.orchestrator.registerTool(calculatorTool);
    this.orchestrator.registerTool(fileSearchTool);
  }

  async execute(params: {
    conversationId: string;
    input: string;
    agentId?: string;
  }): Promise<{ content: string; toolCalls?: any[] }> {
    const ctx: ExecutionContext = {
      requestId: `req_${Date.now()}`,
      conversationId: params.conversationId,
      userId: params.conversationId, // Use conversation as user for memory
      runtime: "node",
    };

    const messages: ChatMessage[] = [{ role: "user", content: params.input }];

    const agent = params.agentId
      ? this.agents.get(params.agentId)
      : this.agents.get("research-agent"); // Default agent

    if (!agent) {
      throw new Error(`Agent not found: ${params.agentId}`);
    }

    const result = await agent.act({ messages }, ctx);

    return {
      content: result.completion,
      toolCalls: result.toolCalls,
    };
  }

  async *executeStream(params: {
    conversationId: string;
    input: string;
    agentId?: string;
  }): AsyncIterable<string> {
    const ctx: ExecutionContext = {
      requestId: `req_${Date.now()}`,
      conversationId: params.conversationId,
      userId: params.conversationId,
      runtime: "node",
    };

    const messages: ChatMessage[] = [{ role: "user", content: params.input }];

    const agent = params.agentId
      ? this.agents.get(params.agentId)
      : this.agents.get("research-agent");

    if (!agent) {
      throw new Error(`Agent not found: ${params.agentId}`);
    }

    // Build system message
    const systemMsg: ChatMessage = {
      role: "system",
      content: agent.definition.systemPrompt || "",
    };

    const allMessages = [systemMsg, ...messages];

    // Stream from LLM
    for await (const chunk of this.llmAdapter.stream(
      allMessages,
      {
        model: agent.definition.model || this.config.config.defaultModel,
        temperature: 0.7,
      },
      ctx
    )) {
      const lastMsg = chunk.messages[chunk.messages.length - 1];
      if (lastMsg && typeof lastMsg.content === "string") {
        yield lastMsg.content;
      }
    }
  }

  async executeMultiAgent(params: {
    goal: string;
    strategy?: "sequential" | "parallel" | "consensus";
    agentIds?: string[];
    requiresApproval?: boolean;
  }): Promise<{ results: any[] }> {
    this.orchestrator.setStrategy(params.strategy || "sequential");

    const ctx: OrchestrationContext = {
      requestId: `req_${Date.now()}`,
      taskId: `task_${Date.now()}`,
      runtime: "node",
      agents: this.agents,
      tools: new Map(
        Array.from(this.toolRegistry.list()).map((t) => [t.schema.name, t])
      ),
    };

    const results = await this.orchestrator.execute(
      {
        id: ctx.taskId!,
        goal: params.goal,
        metadata: { requiresApproval: params.requiresApproval },
      },
      ctx
    );

    return { results };
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values()).map((a) => a.definition);
  }

  listTools(): ToolSchema[] {
    return this.toolRegistry.list().map((t) => t.schema);
  }
}
