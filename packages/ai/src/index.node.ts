// Node/server-oriented entrypoint: exports full surface area.

// Core types
export * from "./core/types/messages";
export * from "./core/types/context";
export * from "./core/types/tools";
export * from "./core/types/agents";
export * from "./core/types/llm";
export * from "./core/types/mcp";
export * from "./core/types/events";
export * from "./types/common";

// Abstractions
export * from "./core/abstractions/llm-adapter";
export * from "./core/abstractions/tool-adapter";
export * from "./core/abstractions/middleware";
export * from "./core/abstractions/plugin";
export * from "./core/abstractions/orchestrator";

// Runtime adapters
export * from "./runtime/adapters/llm/base";
export * from "./runtime/adapters/llm/openai";
export * from "./runtime/adapters/llm/anthropic";
export * from "./runtime/adapters/llm/vercel-ai";
export * from "./runtime/adapters/llm/vercel-ai-sdk";
export * from "./runtime/adapters/llm/vercel-gateway";
export * from "./runtime/adapters/llm/local";
export * from "./runtime/adapters/tools/sdk-tool";
export * from "./runtime/adapters/tools/mcp-tool";
export * from "./runtime/adapters/tools/registry";
export * from "./runtime/adapters/mcp/client";
export * from "./runtime/adapters/mcp/transport";
export * from "./runtime/adapters/mcp/server";

// Middleware + memory
export * from "./runtime/middleware/pipeline";
export * from "./runtime/memory/vector-store";

// Orchestration
export * from "./orchestration/adaptive-orchestrator";
export * from "./orchestration/strategies";
export * from "./orchestration/planner";
export * from "./orchestration/router";
export * from "./orchestration/task-queue";
export * from "./orchestration/approvals";
export * from "./orchestration/triggers";
export * from "./persistence/stores";
export * from "./persistence/redis-adapter";
export * from "./persistence/redis-conversation-store";
export * from "./core/storage/conversation-store";
export * from "./core/storage/history-manager";
export * from "./runtime/tokens/token-tracker";

// Plugins
export { PluginRegistry as PluginRegistryRuntime } from "./plugins/registry";
