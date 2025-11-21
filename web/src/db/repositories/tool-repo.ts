import { db } from "@/db";
import { customTool } from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import { generateRequestId } from "@/lib/server-utils";
import { and, desc, eq, isNull } from "drizzle-orm";

const logger = createLogger("ToolRepo");

type ToolSchema = {
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const toolRepo = {
  async upsertCustomTools(params: {
    tools: Array<{
      id?: string;
      title: string;
      schema: any;
      code: string;
    }>;
    organizationId: string;
    userId: string;
    requestId?: string;
  }) {
    const {
      tools,
      organizationId,
      userId,
      requestId = generateRequestId(),
    } = params;

    // Use a transaction for multi-step database operations
    return await db.transaction(async (tx) => {
      // Process each tool: either update existing or create new
      for (const tool of tools) {
        const nowTime = new Date();

        if (tool.id) {
          // First, check if tool exists in the workspace
          const existingWorkspaceTool = await tx
            .select()
            .from(customTool)
            .where(
              and(
                eq(customTool.id, tool.id),
                eq(customTool.organizationId, organizationId),
              ),
            )
            .limit(1);

          if (existingWorkspaceTool.length > 0) {
            // Tool exists in workspace
            const newFunctionName = tool.schema?.function?.name;
            if (!newFunctionName) {
              throw new Error("Tool schema must include a function name");
            }

            // Check if function name has changed
            if (tool.id !== newFunctionName) {
              throw new Error(
                `Cannot change function name from "${tool.id}" to "${newFunctionName}". Please create a new tool instead.`,
              );
            }

            // Update existing workspace tool
            await tx
              .update(customTool)
              .set({
                title: tool.title,
                schema: tool.schema,
                code: tool.code,
                updatedAt: nowTime,
              })
              .where(
                and(
                  eq(customTool.id, tool.id),
                  eq(customTool.organizationId, organizationId),
                ),
              );
            continue;
          }

          // Check if this is a legacy tool (no organizationId, belongs to user)
          const existingLegacyTool = await tx
            .select()
            .from(customTool)
            .where(
              and(
                eq(customTool.id, tool.id),
                isNull(customTool.organizationId),
                eq(customTool.userId, userId),
              ),
            )
            .limit(1);

          if (existingLegacyTool.length > 0) {
            // Legacy tool found - update it without migrating to workspace
            await tx
              .update(customTool)
              .set({
                title: tool.title,
                schema: tool.schema,
                code: tool.code,
                updatedAt: nowTime,
              })
              .where(eq(customTool.id, tool.id));

            logger.info(`[${requestId}] Updated legacy tool ${tool.id}`);
            continue;
          }
        }

        // Creating new tool - use function name as ID for consistency
        const functionName = tool.schema?.function?.name;
        if (!functionName) {
          throw new Error("Tool schema must include a function name");
        }

        // Check for duplicate function names in workspace
        const duplicateFunction = await tx
          .select()
          .from(customTool)
          .where(
            and(
              eq(customTool.organizationId, organizationId),
              eq(customTool.id, functionName),
            ),
          )
          .limit(1);

        if (duplicateFunction.length > 0) {
          throw new Error(
            `A tool with the function name "${functionName}" already exists in this workspace`,
          );
        }

        // Create new tool using function name as ID
        await tx.insert(customTool).values({
          id: functionName,
          organizationId,
          userId,
          title: tool.title,
          schema: tool.schema,
          code: tool.code,
          createdAt: nowTime,
          updatedAt: nowTime,
        });
      }

      // Fetch and return the created/updated tools
      const resultTools = await tx
        .select()
        .from(customTool)
        .where(eq(customTool.organizationId, organizationId))
        .orderBy(desc(customTool.createdAt));

      return resultTools;
    });
  },

  async findByOrganization(organizationId: string) {
    return db.query.customTool.findMany({
      where: eq(customTool.organizationId, organizationId),
      orderBy: desc(customTool.createdAt),
    });
  },

  async findById(id: string, organizationId: string) {
    return db.query.customTool.findFirst({
      where: and(
        eq(customTool.id, id),
        eq(customTool.organizationId, organizationId),
      ),
    });
  },

  // --- Mutations ---

  async delete(id: string, organizationId: string) {
    const [row] = await db
      .delete(customTool)
      .where(
        and(
          eq(customTool.id, id),
          eq(customTool.organizationId, organizationId),
        ),
      )
      .returning();

    return row;
  },
};
