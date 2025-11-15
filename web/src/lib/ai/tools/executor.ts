import { streamText, Tool as CoreTool } from "ai";
import { myProvider } from "@/lib/ai/providers";
import { toolRegistry } from "@/lib/ai/tools/registry";
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";
import { createLogger } from "@/lib/logs/console/logger";
import { z } from "zod";
import { agentFactory } from "@/lib/ai/tools/factory";

const logger = createLogger("AgentExecutor");

export interface ExecutorContext {
  userId: string;
  chatId: string;
  agentId: string;
  messages: any[];
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

/**
 * Dynamic Agent Executor
 * Automatically discovers and binds tools to agents at runtime
 */
export async function executeAgentWithDynamicTools(context: ExecutorContext) {
  const { userId, chatId, agentId, messages, dataStream } = context;

  logger.info(`Executing agent ${agentId} with dynamic tools`);

  // Get agent configuration and tools
  const agent = await agentFactory.get(agentId, userId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Get agent's tools
  const agentTools = await toolRegistry.getAgentTools(agentId, chatId);

  logger.info(
    `Agent ${agent.config.name} has ${agentTools.length} tools available`
  );

  // Convert UnifiedTools to AI SDK tool format
  const aiSdkTools: Record<string, CoreTool> = {};

  for (const unifiedTool of agentTools) {
    const zodSchema = convertSchemaToZod(unifiedTool.inputSchema);

    // The key is to make execute async and return a value, not a Promise<any>
    aiSdkTools[unifiedTool.name] = {
      type: "function",
      description: unifiedTool.description || `Execute ${unifiedTool.name}`,
      inputSchema: zodSchema,
      execute: async (args) => {
        const startTime = Date.now();
        logger.info(`Executing tool: ${unifiedTool.name}`, { args });

        try {
          // Execute through tool registry
          const result = await toolRegistry.executeTool(unifiedTool.id, {
            userId,
            chatId,
            agentId,
            parameters: args,
          });

          // Send metrics
          dataStream.write({
            type: "data-tool-execution",
            data: {
              toolId: unifiedTool.id,
              toolName: unifiedTool.name,
              toolType: unifiedTool.type,
              executionTime: Date.now() - startTime,
              tokensUsed: result.tokensUsed,
              cost: result.cost,
              success: result.success,
              timestamp: new Date().toISOString(),
            },
            transient: true,
          });

          if (!result.success) {
            throw new Error(result.error || "Tool execution failed");
          }

          // Return the actual data, not a promise
          return result.data;
        } catch (error) {
          logger.error(`Tool execution failed: ${unifiedTool.name}`, error);

          // Send error metric
          dataStream.write({
            type: "data-tool-execution",
            data: {
              toolId: unifiedTool.id,
              toolName: unifiedTool.name,
              toolType: unifiedTool.type,
              executionTime: Date.now() - startTime,
              success: false,
              timestamp: new Date().toISOString(),
            },
            transient: true,
          });

          throw error;
        }
      },
    };
  }

  // Stream text with dynamic tools
  const result = streamText({
    model: myProvider.languageModel(agent.config.model || "chat-model"),
    system: agent.config.systemPrompt,
    messages,
    temperature: agent.config.temperature,
    maxOutputTokens: agent.config.maxTokens,
    tools: aiSdkTools,
    onFinish: async ({ usage }) => {
      logger.info(`Agent ${agentId} execution finished`, { usage });

      dataStream.write({
        type: "data-usage",
        data: usage as any,
        transient: true,
      });
    },
  });

  return result;
}

/**
 * Convert JSON Schema to Zod schema for AI SDK
 * Returns z.ZodObject which is what AI SDK expects
 */
function convertSchemaToZod(schema: any): z.ZodObject<any> {
  if (!schema || typeof schema !== "object") {
    return z.object({});
  }

  const normalized = { ...schema };

  if (!normalized.type && normalized.properties) {
    normalized.type = "object";
  }

  if (!normalized.type) {
    return z.object({});
  }

  if (normalized.type !== "object") {
    return z.object({ value: convertSchemaToZodInner(normalized) });
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  if (normalized.properties) {
    for (const [key, propSchema] of Object.entries(normalized.properties)) {
      let fieldSchema = convertSchemaToZodInner(propSchema);
      if (!normalized.required || !normalized.required.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }
      shape[key] = fieldSchema;
    }
  }

  let objectSchema = z.object(shape);

  if (normalized.additionalProperties) {
    objectSchema = objectSchema.catchall(
      convertSchemaToZodInner(normalized.additionalProperties)
    );
  }

  return objectSchema;
}


/**
 * Helper function to convert individual schema types
 */
function convertSchemaToZodInner(schema: any): z.ZodTypeAny {
  if (!schema) return z.any();

  if (schema.oneOf) {
    return z.union(schema.oneOf.map(convertSchemaToZodInner));
  }

  if (schema.anyOf) {
    return z.union(schema.anyOf.map(convertSchemaToZodInner));
  }

  if (schema.allOf) {
    return schema.allOf.reduce(
      (acc: z.ZodTypeAny, s: any) => {
        const next = convertSchemaToZodInner(s);

        // Merge object shapes
        if (acc instanceof z.ZodObject && next instanceof z.ZodObject) {
          return acc.extend(next.shape);
        }

        // If types differ, fallback to last schema
        return next;
      },
      z.object({})
    );
  }

  if (schema.nullable === true) {
    const inner = convertSchemaToZodInner({ ...schema, nullable: false });
    return inner.nullable();
  }

  if (!schema.type) return z.any();

  switch (schema.type) {
    case "object": {
      const shape: Record<string, z.ZodTypeAny> = {};

      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          let fieldSchema = convertSchemaToZodInner(propSchema);
          if (!schema.required || !schema.required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }
          shape[key] = fieldSchema;
        }
      }

      let objectSchema = z.object(shape);

      if (schema.additionalProperties) {
        objectSchema = objectSchema.catchall(
          convertSchemaToZodInner(schema.additionalProperties)
        );
      }

      return objectSchema; // ✔ FIXED
    }

    case "string": {
      let stringSchema = z.string();

      if (schema.enum && schema.enum.length > 0) {
        return z.enum(schema.enum as [string, ...string[]]);
      }

      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }

      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }

      if (schema.pattern) {
        try {
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        } catch {
          logger.warn(`Invalid regex pattern: ${schema.pattern}`);
        }
      }

      return stringSchema;
    }

    case "number": {
      let n = z.number();
      if (schema.minimum !== undefined) n = n.min(schema.minimum);
      if (schema.maximum !== undefined) n = n.max(schema.maximum);
      return n;
    }

    case "integer": {
      let n = z.number().int();
      if (schema.minimum !== undefined) n = n.min(schema.minimum);
      if (schema.maximum !== undefined) n = n.max(schema.maximum);
      return n;
    }

    case "boolean":
      return z.boolean();

    case "array": {
      if (Array.isArray(schema.items)) {
        return z.tuple(schema.items.map(convertSchemaToZodInner));
      }

      const item = schema.items ? convertSchemaToZodInner(schema.items) : z.any();

      let arr = z.array(item);
      if (schema.minItems !== undefined) arr = arr.min(schema.minItems);
      if (schema.maxItems !== undefined) arr = arr.max(schema.maxItems);
      return arr;
    }

    case "null":
      return z.null();

    default:
      logger.warn(`Unknown schema type: ${schema.type}, using z.any()`);
      return z.any();
  }
}
