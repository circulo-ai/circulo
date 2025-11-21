import { chat, db } from "@/db";
import { toolRepo } from "@/db/repositories/tool-repo";
import { customTool as customTools } from "@/db/schema";
import { checkHybridAuth } from "@/lib/auth/hybrid";
import { createLogger } from "@/lib/logs/console/logger";
import { getUserEntityPermissions } from "@/lib/permissions/utils";
import { generateRequestId } from "@/lib/utils";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const logger = createLogger("CustomToolsAPI");

const CustomToolSchema = z.object({
  tools: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string().min(1, "Tool title is required"),
      schema: z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1, "Function name is required"),
          description: z.string().optional(),
          parameters: z.object({
            type: z.string(),
            properties: z.record(z.any(), z.any()),
            required: z.array(z.string()).optional(),
          }),
        }),
      }),
      code: z.string(),
    }),
  ),
  organizationId: z.string().optional(),
});

// GET - Fetch all custom tools for the organization
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get("organizationId");
  const chatId = searchParams.get("chatId");

  try {
    // Use hybrid auth to support session, API key, and internal JWT
    const authResult = await checkHybridAuth(request, { requireChatId: false });
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized custom tools access attempt`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;

    let resolvedorganizationId: string | null = organizationId;

    if (!resolvedorganizationId && chatId) {
      const [workflowData] = await db
        .select({ organizationId: chat.organizationId })
        .from(chat)
        .where(eq(chat.id, chatId))
        .limit(1);

      if (!workflowData) {
        logger.warn(`[${requestId}] Workflow not found: ${chatId}`);
        return NextResponse.json(
          { error: "Workflow not found" },
          { status: 404 },
        );
      }

      resolvedorganizationId = workflowData.organizationId;
    }

    // Check organization permissions
    // For internal JWT with chatId: checkHybridAuth already resolved userId from workflow owner
    // For session/API key: verify user has access to the organization
    // For legacy (no organizationId): skip organization check, rely on userId match
    if (
      resolvedorganizationId &&
      !(authResult.authType === "internal_jwt" && chatId)
    ) {
      const userPermission = await getUserEntityPermissions(
        userId,
        "organization",
        resolvedorganizationId,
      );
      if (!userPermission) {
        logger.warn(
          `[${requestId}] User ${userId} does not have access to organization ${resolvedorganizationId}`,
        );
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Build query to fetch tools
    // 1. organization-scoped tools: tools with matching organizationId
    // 2. User-scoped legacy tools: tools with null organizationId and matching userId
    const conditions = [];

    if (resolvedorganizationId) {
      conditions.push(eq(customTools.organizationId, resolvedorganizationId));
    }

    // Always include legacy user-scoped tools for backward compatibility
    conditions.push(
      and(isNull(customTools.organizationId), eq(customTools.userId, userId)),
    );

    const result = await db
      .select()
      .from(customTools)
      .where(or(...conditions))
      .orderBy(desc(customTools.createdAt));

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    logger.error(`[${requestId}] Error fetching custom tools:`, error);
    return NextResponse.json(
      { error: "Failed to fetch custom tools" },
      { status: 500 },
    );
  }
}

// POST - Create or update custom tools
export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    // Use hybrid auth (though this endpoint is only called from UI)
    const authResult = await checkHybridAuth(req, { requireChatId: false });
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized custom tools update attempt`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;
    const body = await req.json();

    try {
      // Validate the request body
      const { tools, organizationId } = CustomToolSchema.parse(body);

      if (!organizationId) {
        logger.warn(`[${requestId}] Missing organizationId in request body`);
        return NextResponse.json(
          { error: "organizationId is required" },
          { status: 400 },
        );
      }

      // Check organization permissions
      const userPermission = await getUserEntityPermissions(
        userId,
        "organization",
        organizationId,
      );
      if (!userPermission) {
        logger.warn(
          `[${requestId}] User ${userId} does not have access to organization ${organizationId}`,
        );
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Check write permission
      if (userPermission !== "admin" && userPermission !== "write") {
        logger.warn(
          `[${requestId}] User ${userId} does not have write permission for organization ${organizationId}`,
        );
        return NextResponse.json(
          { error: "Write permission required" },
          { status: 403 },
        );
      }

      // Use the extracted upsert function
      const resultTools = await toolRepo.upsertCustomTools({
        tools,
        organizationId,
        userId,
        requestId,
      });

      return NextResponse.json({ success: true, data: resultTools });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid custom tools data`, {
          errors: validationError.issues,
        });
        return NextResponse.json(
          { error: "Invalid request data", details: validationError.issues },
          { status: 400 },
        );
      }
      throw validationError;
    }
  } catch (error) {
    logger.error(`[${requestId}] Error updating custom tools`, error);
    return NextResponse.json(
      { error: "Failed to update custom tools" },
      { status: 500 },
    );
  }
}

// DELETE - Delete a custom tool by ID
export async function DELETE(request: NextRequest) {
  const requestId = generateRequestId();
  const searchParams = request.nextUrl.searchParams;
  const toolId = searchParams.get("id");
  const organizationId = searchParams.get("organizationId");

  if (!toolId) {
    logger.warn(`[${requestId}] Missing tool ID for deletion`);
    return NextResponse.json({ error: "Tool ID is required" }, { status: 400 });
  }

  try {
    // Use hybrid auth (though this endpoint is only called from UI)
    const authResult = await checkHybridAuth(request, { requireChatId: false });
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized custom tool deletion attempt`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;

    // Check if the tool exists
    const existingTool = await db
      .select()
      .from(customTools)
      .where(eq(customTools.id, toolId))
      .limit(1);

    if (existingTool.length === 0) {
      logger.warn(`[${requestId}] Tool not found: ${toolId}`);
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    const tool = existingTool[0];

    // Handle organization-scoped tools
    if (tool.organizationId) {
      if (!organizationId) {
        logger.warn(
          `[${requestId}] Missing organizationId for organization-scoped tool`,
        );
        return NextResponse.json(
          { error: "organizationId is required" },
          { status: 400 },
        );
      }

      // Check organization permissions
      const userPermission = await getUserEntityPermissions(
        userId,
        "organization",
        organizationId,
      );
      if (!userPermission) {
        logger.warn(
          `[${requestId}] User ${userId} does not have access to organization ${organizationId}`,
        );
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Check write permission
      if (userPermission !== "admin" && userPermission !== "write") {
        logger.warn(
          `[${requestId}] User ${userId} does not have write permission for organization ${organizationId}`,
        );
        return NextResponse.json(
          { error: "Write permission required" },
          { status: 403 },
        );
      }

      // Verify tool belongs to this organization
      if (tool.organizationId !== organizationId) {
        logger.warn(
          `[${requestId}] Tool ${toolId} does not belong to organization ${organizationId}`,
        );
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }
    } else {
      // Handle legacy user-scoped tools (no organizationId)
      // Only allow deletion if user owns the tool
      if (tool.userId !== userId) {
        logger.warn(
          `[${requestId}] User ${userId} attempted to delete tool they don't own: ${toolId}`,
        );
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Delete the tool
    await db.delete(customTools).where(eq(customTools.id, toolId));

    logger.info(`[${requestId}] Deleted tool: ${toolId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(`[${requestId}] Error deleting custom tool:`, error);
    return NextResponse.json(
      { error: "Failed to delete custom tool" },
      { status: 500 },
    );
  }
}
