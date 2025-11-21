import { Tool as CoreTool } from "ai";
import { z, ZodType } from "zod";

// ==================== TYPES ====================

export type ToolEnvVars = Record<string, string | undefined>;

export type ToolConfig = Record<string, unknown>;

// Base interface without generics for storage
export interface BaseToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  parametersSchema: ZodType<unknown, ZodType>;
  configSchema: ZodType<unknown, ZodType>;
  createRuntime: (ctx: ToolRuntimeContext) => CoreTool;
  summarizeInstance?: (
    env: ToolEnvVars,
    config: Record<string, unknown>,
  ) => string[];
}

// Generic interface for defining tools with type safety
export interface ToolDefinition<
  TParams extends ZodType = ZodType,
  TConfig extends ZodType = ZodType,
> {
  id: string;
  name: string;
  description: string;
  category: string;
  parametersSchema: TParams;
  configSchema: TConfig;
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
  createRuntime: (ctx: ToolRuntimeContext<z.infer<TConfig>>) => CoreTool;
  summarizeInstance?: (
    env: ToolEnvVars,
    config: Record<string, unknown>,
  ) => string[];
}

export interface ToolRuntimeContext<TConfig = Record<string, unknown>> {
  env: ToolEnvVars;
  config: TConfig;
  instanceId?: string;
}

// ==================== REGISTRY ====================

class ToolRegistry {
  private tools = new Map<string, BaseToolDefinition>();

  register<TParams extends ZodType, TConfig extends ZodType>(
    tool: ToolDefinition<TParams, TConfig>,
  ): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Tool ${tool.id} already registered, overwriting`);
    }
    // Store as base definition - type info is preserved via schemas
    this.tools.set(tool.id, tool as unknown as BaseToolDefinition);
  }

  get(id: string): BaseToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAll(): BaseToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): BaseToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  getCategories(): string[] {
    return [...new Set(this.getAll().map((t) => t.category))];
  }

  /**
   * Validate that all required env vars are present
   */
  validateEnv(
    toolId: string,
    env: ToolEnvVars,
  ): {
    valid: boolean;
    missing: string[];
  } {
    const tool = this.get(toolId);
    if (!tool) return { valid: false, missing: [`Tool ${toolId} not found`] };

    const missing = tool.requiredEnvVars.filter(
      (v) => !env[v] || env[v]?.trim() === "",
    );

    return { valid: missing.length === 0, missing };
  }

  /**
   * Validate config against tool's schema
   */
  validateConfig(
    toolId: string,
    config: unknown,
  ): {
    valid: boolean;
    data?: unknown;
    error?: string;
  } {
    const tool = this.get(toolId);
    if (!tool) return { valid: false, error: `Tool ${toolId} not found` };

    const result = tool.configSchema.safeParse(config);
    if (!result.success) {
      return { valid: false, error: result.error.message };
    }

    return { valid: true, data: result.data };
  }

  /**
   * Create a runtime tool instance with validated env and config
   */
  createTool(toolId: string, ctx: ToolRuntimeContext): CoreTool | null {
    const tool = this.get(toolId);
    if (!tool) {
      console.error(`Tool ${toolId} not found in registry`);
      return null;
    }

    const { valid, missing } = this.validateEnv(toolId, ctx.env);
    if (!valid) {
      console.error(`Tool ${toolId} missing env vars: ${missing.join(", ")}`);
      return null;
    }

    // Validate and parse config
    const configResult = this.validateConfig(toolId, ctx.config);
    if (!configResult.valid) {
      console.error(`Tool ${toolId} invalid config: ${configResult.error}`);
      return null;
    }

    try {
      return tool.createRuntime({
        env: ctx.env,
        config: configResult.data as Record<string, unknown>,
        instanceId: ctx.instanceId,
      });
    } catch (err) {
      console.error(`Failed to create tool ${toolId}:`, err);
      return null;
    }
  }
}

export const toolRegistry = new ToolRegistry();

// ==================== HELPER TO DEFINE TOOLS ====================

/**
 * Define and register a tool with full type safety.
 *
 * @example
 * const myTool = defineTool({
 *   id: "my.tool",
 *   name: "My Tool",
 *   description: "Does something useful",
 *   category: "utility",
 *   parametersSchema: z.object({ input: z.string() }),
 *   configSchema: z.object({ apiKey: z.string().optional() }),
 *   requiredEnvVars: ["MY_API_KEY"],
 *   createRuntime: (ctx) => tool({
 *     description: "...",
 *     parameters: z.object({ input: z.string() }),
 *     execute: async ({ input }) => { ... }
 *   }),
 * });
 */
export function defineTool<TParams extends ZodType, TConfig extends ZodType>(
  def: ToolDefinition<TParams, TConfig>,
): ToolDefinition<TParams, TConfig> {
  toolRegistry.register(def);
  return def;
}
