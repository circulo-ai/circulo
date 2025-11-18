import { chatRepo } from "@/db/repositories/chat-repo";
import { mcpServerRepo } from "@/db/repositories/mcp-server-repo";
import { updateMcpServerSchema } from "@/db/schema";
import { mcpService } from "@/lib/mcp/service";
import { validateMcpServerUrl } from "@/lib/mcp/url-validator";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

export const GET = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
  },
  async (req, ctx) => {
    const server = await mcpServerRepo.findById(ctx.params.id);
    if (!server || server.deletedAt) {
      throw Errors.notFound("MCP server not found");
    }

    // Verify user has access to the chat
    const chat = await chatRepo.findById(server.chatId);
    if (!chat) throw Errors.notFound("Chat not found");

    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this server");
    }

    return success({ server });
  },
);

export const PATCH = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
    body: updateMcpServerSchema,
  },
  async (req, ctx) => {
    const server = await mcpServerRepo.findById(ctx.params.id);
    if (!server || server.deletedAt) {
      throw Errors.notFound("MCP server not found");
    }

    // Validate URL if it's being updated
    if (ctx.body.url) {
      const urlValidation = validateMcpServerUrl(ctx.body.url);
      if (!urlValidation.isValid) {
        throw Errors.badRequest(urlValidation.error!);
      }
    }

    const chat = await chatRepo.findById(server.chatId);
    if (!chat || chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this server");
    }

    const updated = await mcpServerRepo.update(ctx.params.id, ctx.body);

    // If connection settings changed, clear cache
    if (ctx.body.url || ctx.body.transport || ctx.body.headers) {
      mcpService.clearCache(server.chatId);
    }

    return success({ server: updated });
  },
);

export const DELETE = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
  },
  async (req, ctx) => {
    const server = await mcpServerRepo.findById(ctx.params.id);
    if (!server || server.deletedAt) {
      throw Errors.notFound("MCP server not found");
    }

    const chat = await chatRepo.findById(server.chatId);
    if (!chat || chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this server");
    }

    // Soft delete
    await mcpServerRepo.softDelete(ctx.params.id);

    // Clear cache
    mcpService.clearCache(server.chatId);

    return success({ deleted: true });
  },
);
