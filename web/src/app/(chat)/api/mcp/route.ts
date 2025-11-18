import { chatRepo } from "@/db/repositories/chat-repo";
import { mcpServerRepo } from "@/db/repositories/mcp-server-repo";
import { createMcpServerSchema } from "@/db/schema";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { mcpService } from "@/lib/mcp/service";
import { validateMcpServerUrl } from "@/lib/mcp/url-validator";
import { api, Errors, success } from "@/lib/server";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";

// GET /api/mcp-servers - List MCP servers for a chat
export const GET = api(
  {
    auth: true,
    query: z.object({
      chatId: z.string(),
      enabled: z.coerce.boolean().optional(),
    }),
  },
  async (req, ctx) => {
    // Verify user has access to chat
    const chat = await chatRepo.findById(ctx.query.chatId);
    if (!chat) throw Errors.notFound("Chat not found");

    // Check if user is member or creator
    if (chat.creatorId !== ctx.user.id) {
      // TODO: Check if user is a chat member
      // const isMember = await chatRepo.isMember(ctx.query.chatId, ctx.user.id);
      // if (!isMember) {
      //   throw Errors.forbidden("You don't have access to this chat");
      // }
    }

    const servers = await mcpServerRepo.findByChat(ctx.query.chatId, {
      enabled: ctx.query.enabled,
    });

    return success({ servers });
  },
);

// POST /api/mcp-servers - Create MCP server
export const POST = api(
  {
    auth: true,
    body: createMcpServerSchema,
  },
  async (req, ctx) => {
    const { chatId, url } = ctx.body;

    // Validate URL for SSRF protection
    const urlValidation = validateMcpServerUrl(url);
    if (!urlValidation.isValid) {
      throw Errors.badRequest(urlValidation.error!);
    }

    // Verify user has access to chat
    const chat = await chatRepo.findById(chatId);
    if (!chat) throw Errors.notFound("Chat not found");

    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this chat");
    }

    const { allowed } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "create_mcp_server",
    );
    if (!allowed) {
      throw Errors.tooManyRequests(
        "Usage limit exceeded for creating MCP servers",
      );
    }

    // Create the server
    const server = await mcpServerRepo.create({
      id: ctx.body.id || generateUUID(),
      ...ctx.body,
      createdBy: ctx.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Try to discover tools
    try {
      const tools = await mcpService.discoverServerTools(
        ctx.user.id,
        server.id,
        chatId,
      );

      await mcpServerRepo.updateToolCount(server.id, tools.length);
      await mcpServerRepo.updateConnectionStatus(server.id, {
        connectionStatus: "connected",
        lastConnected: new Date(),
        lastError: null,
      });

      return success(
        {
          server: { ...server, toolCount: tools.length },
          toolsDiscovered: tools.length,
        },
        201,
      );
    } catch (error) {
      // Server created but connection failed
      await mcpServerRepo.updateConnectionStatus(server.id, {
        connectionStatus: "error",
        lastError: error instanceof Error ? error.message : "Unknown error",
      });

      return success(
        {
          server,
          warning: "Server created but initial connection failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        201,
      );
    }
  },
);
