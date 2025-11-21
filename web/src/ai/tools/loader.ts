import { db } from "@/db";
import { agentToolConfig } from "@/db/schema";
import { Tool as CoreTool } from "ai";
import { eq } from "drizzle-orm";
import { ToolEnvVars, toolRegistry } from "./registry";
import { getMergedEnv } from "@/lib/environment/utils";

// ==================== TYPES ====================

export interface ToolLoadContext {
  organizationId?: string;
  userId?: string;
  chatId?: string;
}

export interface LoadedTool {
  id: string;
  instanceId: string;
  tool: CoreTool;
}

export interface ToolLoadResult {
  tools: Record<string, CoreTool>;
  loaded: string[];
  failed: Array<{ toolId: string; reason: string }>;
}

// ==================== LOADER ====================

/**
 * Load all tools configured for an agent with resolved environment variables.
 */
export async function loadToolsForAgent(
  agentId: string,
  context: ToolLoadContext,
): Promise<ToolLoadResult> {
  await toolRegistry.initBuiltins();
  // Get agent's tool configurations
  const configs = await db.query.agentToolConfig.findMany({
    where: eq(agentToolConfig.agentId, agentId),
  });

  if (configs.length === 0) {
    return { tools: {}, loaded: [], failed: [] };
  }

  // Resolve environment variables (org → user → chat cascade)
  const baseEnv = await getMergedEnv({
    organizationId: context.organizationId,
    userId: context.userId,
    chatId: context.chatId,
  });

  const tools: Record<string, CoreTool> = {};
  const loaded: string[] = [];
  const failed: Array<{ toolId: string; reason: string }> = [];

  const enabledConfigs = configs.filter((c) => c.isEnabled);
  const orderedConfigs = enabledConfigs.slice().sort((a, b) => {
    if (a.toolId === b.toolId) {
      const at = (a as any).createdAt
        ? new Date((a as any).createdAt).getTime()
        : 0;
      const bt = (b as any).createdAt
        ? new Date((b as any).createdAt).getTime()
        : 0;
      return at - bt;
    }
    return a.toolId.localeCompare(b.toolId);
  });

  const counters = new Map<string, number>();

  for (const config of orderedConfigs) {
    const toolDef = toolRegistry.get(config.toolId);
    if (!toolDef) {
      failed.push({
        toolId: config.toolId,
        reason: "Tool not found in registry",
      });
      continue;
    }

    // Merge instance-level env overrides
    const env: ToolEnvVars = {
      ...baseEnv,
      ...((config.envOverrides as Record<string, string>) || {}),
    };

    // Validate required env vars
    const validation = toolRegistry.validateEnv(config.toolId, env);
    if (!validation.valid) {
      failed.push({
        toolId: config.toolId,
        reason: `Missing env vars: ${validation.missing.join(", ")}`,
      });
      continue;
    }

    // Create runtime tool
    const runtimeTool = toolRegistry.createTool(config.toolId, {
      env,
      config: config.config as Record<string, unknown>,
      instanceId: config.id,
    });

    if (runtimeTool) {
      const current = counters.get(config.toolId) ?? 0;
      const next = current + 1;
      counters.set(config.toolId, next);
      let instanceKey = `${config.toolId}:${next}`;
      if (instanceKey.length > 64) instanceKey = instanceKey.slice(0, 64);
      tools[instanceKey] = runtimeTool;
      loaded.push(instanceKey);
    } else {
      failed.push({
        toolId: config.toolId,
        reason: "Failed to create runtime",
      });
    }
  }

  return { tools, loaded, failed };
}

/**
 * Get available tools for an agent (metadata only, no runtime).
 */
export async function getAvailableToolsForAgent(
  agentId: string,
  context: ToolLoadContext,
): Promise<
  Array<{
    toolId: string;
    name: string;
    description: string;
    category: string;
    isConfigured: boolean;
    missingEnvVars: string[];
  }>
> {
  await toolRegistry.initBuiltins();
  const configs = await db.query.agentToolConfig.findMany({
    where: eq(agentToolConfig.agentId, agentId),
  });

  const baseEnv = await getMergedEnv({
    organizationId: context.organizationId,
    userId: context.userId,
    chatId: context.chatId,
  });

  const configMap = new Map(configs.map((c) => [c.toolId, c]));

  return toolRegistry.getAll().map((toolDef) => {
    const config = configMap.get(toolDef.id);
    const env: ToolEnvVars = {
      ...baseEnv,
      ...((config?.envOverrides as Record<string, string>) || {}),
    };

    const validation = toolRegistry.validateEnv(toolDef.id, env);

    return {
      toolId: toolDef.id,
      name: toolDef.name,
      description: toolDef.description,
      category: toolDef.category,
      isConfigured: config?.isEnabled ?? false,
      missingEnvVars: validation.missing,
    };
  });
}

/**
 * Load specific tools by ID (for custom tool selection).
 */
export async function loadToolsById(
  toolIds: string[],
  context: ToolLoadContext,
): Promise<ToolLoadResult> {
  await toolRegistry.initBuiltins();
  const baseEnv = await getMergedEnv({
    organizationId: context.organizationId,
    userId: context.userId,
    chatId: context.chatId,
  });

  const tools: Record<string, CoreTool> = {};
  const loaded: string[] = [];
  const failed: Array<{ toolId: string; reason: string }> = [];

  for (const toolId of toolIds) {
    const toolDef = toolRegistry.get(toolId);
    if (!toolDef) {
      failed.push({ toolId, reason: "Tool not found in registry" });
      continue;
    }

    const validation = toolRegistry.validateEnv(toolId, baseEnv);
    if (!validation.valid) {
      failed.push({
        toolId,
        reason: `Missing env vars: ${validation.missing.join(", ")}`,
      });
      continue;
    }

    const runtimeTool = toolRegistry.createTool(toolId, {
      env: baseEnv,
      config: {},
    });

    if (runtimeTool) {
      tools[toolId] = runtimeTool;
      loaded.push(toolId);
    } else {
      failed.push({ toolId, reason: "Failed to create runtime" });
    }
  }

  return { tools, loaded, failed };
}
