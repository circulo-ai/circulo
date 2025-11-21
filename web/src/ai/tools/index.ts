/**
 * Tool Registry Index
 *
 * Import this file to register all built-in tools.
 * Tools are auto-registered when their modules are imported.
 */

// ==================== IMPORT ALL TOOL MODULES ====================
// Each import registers the tools defined in that module

// Communication
import "./telegram";

// ==================== RE-EXPORT REGISTRY ====================
export { defineTool, toolRegistry } from "./registry";
export type {
  ToolDefinition,
  ToolEnvVars,
  ToolRuntimeContext,
} from "./registry";

// ==================== TOOL DISCOVERY ====================
import { toolRegistry } from "./registry";

/**
 * Get all registered tools grouped by category
 */
export function getToolCatalog() {
  const tools = toolRegistry.getAll();
  const categories = toolRegistry.getCategories();

  return {
    categories: categories.map((cat) => ({
      name: cat,
      tools: tools
        .filter((t) => t.category === cat)
        .map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          requiredEnvVars: t.requiredEnvVars,
          optionalEnvVars: t.optionalEnvVars ?? [],
        })),
    })),
    totalTools: tools.length,
  };
}

/**
 * Get tool metadata for frontend display
 */
export function getToolMetadata(toolId: string) {
  const tool = toolRegistry.get(toolId);
  if (!tool) return null;

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    requiredEnvVars: tool.requiredEnvVars,
    optionalEnvVars: tool.optionalEnvVars ?? [],
    // Don't expose schemas directly - they're Zod objects
    hasConfig: true,
  };
}

/**
 * Validate tool configuration
 */
export function validateToolConfig(toolId: string, config: unknown) {
  const tool = toolRegistry.get(toolId);
  if (!tool) {
    return { valid: false, error: "Tool not found" };
  }

  const result = tool.configSchema.safeParse(config);
  if (!result.success) {
    return { valid: false, error: result.error.flatten() };
  }

  return { valid: true, config: result.data };
}
