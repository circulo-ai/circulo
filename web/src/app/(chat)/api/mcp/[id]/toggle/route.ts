import { chatRepo } from "@/db/repositories/chat-repo";
import { mcpServerRepo } from "@/db/repositories/mcp-server-repo";
import { mcpService } from "@/lib/mcp/service";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
    body: z.object({
      enabled: z.boolean(),
    }),
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

    // Toggle enabled status
    const updated = await mcpServerRepo.toggleEnabled(
      ctx.params.id,
      ctx.body.enabled,
    );

    // Clear cache to force re-discovery
    mcpService.clearCache(server.chatId);

    // If enabling, try to connect and update status
    if (ctx.body.enabled) {
      try {
        const tools = await mcpService.discoverServerTools(
          ctx.user.id,
          ctx.params.id,
          server.chatId,
        );

        await mcpServerRepo.updateToolCount(ctx.params.id, tools.length);
        await mcpServerRepo.updateConnectionStatus(ctx.params.id, {
          connectionStatus: "connected",
          lastConnected: new Date(),
          lastError: null,
        });
      } catch (error) {
        await mcpServerRepo.updateConnectionStatus(ctx.params.id, {
          connectionStatus: "error",
          lastError: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return success({ server: updated });
  },
);