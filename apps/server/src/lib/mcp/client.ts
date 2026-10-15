import { db } from "@/db";
import { chatMemberRepo, chatRepo } from "@/db/repositories";
import { agent as agentTable, mcpIntegration } from "@/db/schema";
import { createHumanApprovalRequest } from "@/lib/ai/tools/request-human-approval";
import { currentAutomationPermissions } from "@/lib/automation-actor";
import { createLogger } from "@/lib/logs/console/logger";
import { validateMcpEndpoint } from "@/lib/mcp/endpoint";
import type { ApiKeyPermissions } from "@/lib/permissions";
import { hasPermissionForUser } from "@/lib/permissions";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  dynamicTool,
  jsonSchema,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import { and, eq } from "drizzle-orm";

const logger = createLogger("McpClient");

const MCP_CREDENTIAL_REF = /^MCP_CREDENTIAL_[A-Z0-9_]+$/;

type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  readOnlyHint?: boolean;
};

function getCredential(credentialRef: string | null) {
  if (!credentialRef) return undefined;
  if (!MCP_CREDENTIAL_REF.test(credentialRef)) {
    throw new Error(
      "MCP credential references must use the MCP_CREDENTIAL_* environment variable namespace",
    );
  }
  const value = process.env[credentialRef];
  if (!value) {
    throw new Error(
      `MCP credential reference ${credentialRef} is not configured`,
    );
  }
  return value;
}

export class McpClient {
  constructor(
    private readonly integration: typeof mcpIntegration.$inferSelect,
  ) {}

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    return this.operate(async (client, bounded) => {
      const tools: McpTool[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const result = await client.listTools(cursor ? { cursor } : {}, {
          signal: bounded,
          timeout: 60_000,
        });
        tools.push(...result.tools);
        if (tools.length > 5000)
          throw new Error("MCP tool catalog exceeds the discovery limit.");
        if (!result.nextCursor) return tools;
        if (seen.has(result.nextCursor))
          throw new Error("MCP tool pagination repeated a cursor.");
        seen.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      throw new Error("MCP tool pagination exceeds the discovery limit.");
    }, signal);
  }

  async callTool(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return this.operate(async (client, bounded) => {
      const response = await client.callTool(
        { name, arguments: input },
        undefined,
        { signal: bounded, timeout: 60_000 },
      );
      if (response.isError === true)
        throw new Error(`MCP tool ${name} reported an execution error.`);
      return response.structuredContent
        ? {
            content: response.content,
            structuredContent: response.structuredContent,
          }
        : response.content;
    }, signal);
  }

  private async operate<T>(
    operation: (client: Client, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const deadline = AbortSignal.timeout(60_000);
    const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const endpoint = new URL(
      await validateMcpEndpoint(this.integration.endpoint),
    );
    const credential = getCredential(this.integration.credentialRef);
    const requestInit: RequestInit = {
      headers: credential ? { Authorization: `Bearer ${credential}` } : {},
    };
    const guardedFetch: typeof fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== endpoint.origin)
        throw new Error(
          "MCP requests must remain on the configured server origin.",
        );
      await validateMcpEndpoint(url.href);
      const response = await fetch(url, {
        ...init,
        redirect: "manual",
        signal: init?.signal
          ? AbortSignal.any([bounded, init.signal])
          : bounded,
      });
      if (response.status >= 300 && response.status < 400)
        throw new Error(
          "MCP redirects are disabled. Configure the final server endpoint.",
        );
      return response;
    };
    const transport =
      this.integration.transport === "sse"
        ? new SSEClientTransport(endpoint, { fetch: guardedFetch, requestInit })
        : new StreamableHTTPClientTransport(endpoint, {
            fetch: guardedFetch,
            requestInit,
            reconnectionOptions: {
              maxRetries: 0,
              initialReconnectionDelay: 1000,
              maxReconnectionDelay: 1000,
              reconnectionDelayGrowFactor: 1,
            },
          });
    const client = new Client(
      { name: "circulo", version: "0.1.0" },
      { capabilities: {} },
    );
    let rejectAbort: (error: unknown) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      rejectAbort(bounded.reason ?? new Error("MCP operation cancelled"));
      void transport.close();
    };
    bounded.addEventListener("abort", onAbort, { once: true });
    try {
      bounded.throwIfAborted();
      await Promise.race([
        client.connect(transport, { signal: bounded, timeout: 60_000 }),
        aborted,
      ]);
      return await Promise.race([operation(client, bounded), aborted]);
    } finally {
      bounded.removeEventListener("abort", onAbort);
      await client.close().catch(() => undefined);
    }
  }
}

export async function getMcpToolsForAgent(params: {
  organizationId: string;
  chatId: string;
  agentId?: string;
  session: ActorContext;
  workflowId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  allowedIntegrationIds?: string[];
}): Promise<ToolSet> {
  if (
    !(await hasPermissionForUser(
      params.session.userId,
      params.organizationId,
      "mcp",
      "read",
      params.session.apiKeyPermissions,
    ))
  )
    return {};
  const integrations = await db.query.mcpIntegration.findMany({
    where: and(
      eq(mcpIntegration.organizationId, params.organizationId),
      eq(mcpIntegration.enabled, true),
      eq(mcpIntegration.status, "published"),
    ),
    with: { links: true, tools: true },
  });
  const tools: ToolSet = {};

  for (const integration of integrations) {
    if (
      params.allowedIntegrationIds !== undefined &&
      !params.allowedIntegrationIds.some(
        (id) =>
          id === integration.id ||
          id === `mcp:${integration.id}` ||
          id.startsWith(`mcp_${integration.id.replaceAll("-", "_")}_`),
      )
    ) {
      continue;
    }
    const links = integration.links.filter(
      (link) =>
        link.enabled &&
        (link.scope === "organization" ||
          (link.scope === "chat" && link.chatId === params.chatId) ||
          (link.scope === "agent" &&
            params.agentId !== undefined &&
            link.agentId === params.agentId)),
    );
    if (links.length === 0) continue;

    const client = new McpClient(integration);
    const hasToolSnapshot = integration.tools.length > 0;
    const configuredTools = integration.tools.filter((tool) => tool.enabled);
    let available: Array<
      McpTool & { approvalMode?: "auto" | "prompt" | "writes" | "approve" }
    >;
    if (hasToolSnapshot) {
      available = configuredTools.map((tool) => ({
        name: tool.name,
        title: tool.title ?? undefined,
        description: tool.description ?? undefined,
        inputSchema: tool.inputSchema,
        readOnlyHint: tool.readOnlyHint ?? undefined,
        approvalMode: tool.approvalMode,
      }));
    } else {
      try {
        available = (await client.listTools()).map((tool) => ({
          ...tool,
          approvalMode: "prompt" as const,
        }));
      } catch (error) {
        logger.error("[MCP] unable to list tools", {
          integrationId: integration.id,
          error,
        });
        continue;
      }
    }

    const allowedTools = new Set(links.flatMap((link) => link.allowedTools));
    // Applicable scopes grant access independently. An unrestricted scope
    // must not be narrowed by an additional, restricted link.
    const hasAllowList = links.every((link) => link.allowedTools.length > 0);
    for (const remoteTool of available) {
      if (hasAllowList && !allowedTools.has(remoteTool.name)) continue;
      const readOnlyHint =
        remoteTool.readOnlyHint ?? remoteTool.annotations?.readOnlyHint ?? null;
      const approvalMode = remoteTool.approvalMode ?? "prompt";
      const name = `mcp_${integration.id.replaceAll("-", "_")}_${remoteTool.name.replaceAll(/[^a-zA-Z0-9_]/g, "_")}`;
      if (
        params.allowedIntegrationIds !== undefined &&
        !params.allowedIntegrationIds.some(
          (id) =>
            id === integration.id ||
            id === `mcp:${integration.id}` ||
            id === name,
        )
      )
        continue;
      tools[name] = dynamicTool({
        description:
          `MCP integration: ${integration.name}. Remote tool: ${remoteTool.name}. ` +
          (remoteTool.title ? `${remoteTool.title}: ` : "") +
          (remoteTool.description ??
            `MCP tool ${remoteTool.name} from ${integration.name}`),
        inputSchema: jsonSchema(
          remoteTool.inputSchema ?? {
            type: "object",
            additionalProperties: true,
          },
        ),
        execute: async (input, call) => {
          const current = await assertMcpInvocationAccess({
            userId: params.session.userId,
            organizationId: params.organizationId,
            chatId: params.chatId,
            agentId: params.agentId,
            integrationId: integration.id,
            toolName: remoteTool.name,
            apiKeyPermissions: params.session.apiKeyPermissions,
            apiKeyId: params.session.apiKeyId,
          });
          const requiresApproval =
            approvalMode === "approve" ||
            (approvalMode === "prompt" && readOnlyHint !== true) ||
            (approvalMode === "writes" && readOnlyHint !== true);
          if (requiresApproval) {
            const approval = await createHumanApprovalRequest({
              session: params.session,
              chatId: params.chatId,
              workflowRunId: params.workflowId,
              title: `Approve ${remoteTool.title ?? remoteTool.name}`,
              description: `The ${integration.name} app requested permission to call ${remoteTool.name}. Review the arguments before allowing it.`,
              requestedAction: {
                kind: "mcp_tool_call",
                integrationId: integration.id,
                integrationName: integration.name,
                tool: remoteTool.name,
                arguments: isRecord(input) ? input : {},
                readOnlyHint,
                agentId: params.agentId ?? null,
                apiKeyPermissions: params.session.apiKeyPermissions ?? null,
              },
            });
            params.dataStream.write({
              type: "data-workflowApprovalRequested",
              data: {
                id: approval.id,
                title: approval.title,
                status: approval.status,
              },
              transient: false,
            });
            return {
              approvalId: approval.id,
              status: approval.status,
              message:
                "Approval requested. The MCP action has not been executed.",
            };
          }
          return new McpClient(current).callTool(
            remoteTool.name,
            isRecord(input) ? input : {},
            call.abortSignal,
          );
        },
      });
    }
  }

  return tools;
}

/** Recheck revocation at action time, including after a human approval wait. */
export async function assertMcpInvocationAccess(params: {
  userId: string;
  organizationId: string;
  chatId: string;
  integrationId: string;
  toolName: string;
  agentId?: string;
  apiKeyPermissions?: ApiKeyPermissions;
  apiKeyId?: string;
}) {
  const permissions = await currentAutomationPermissions(params);
  if (
    !(await hasPermissionForUser(
      params.userId,
      params.organizationId,
      "mcp",
      "read",
      permissions,
    ))
  )
    throw new Error("Your current role or API key does not allow MCP access.");
  const chat = await chatRepo.findById(params.chatId);
  if (
    !chat ||
    chat.isDeleted ||
    chat.organizationId !== params.organizationId ||
    !(await chatMemberRepo.isMember(params.userId, params.chatId))
  )
    throw new Error("The requester no longer has access to this chat.");
  const integration = await db.query.mcpIntegration.findFirst({
    where: and(
      eq(mcpIntegration.id, params.integrationId),
      eq(mcpIntegration.organizationId, params.organizationId),
      eq(mcpIntegration.enabled, true),
      eq(mcpIntegration.status, "published"),
    ),
    with: { links: true, tools: true },
  });
  if (!integration)
    throw new Error("This published MCP integration is no longer available.");
  const granted = integration.links.some(
    (link) =>
      link.enabled &&
      (link.scope === "organization" ||
        (link.scope === "chat" && link.chatId === params.chatId) ||
        (link.scope === "agent" && link.agentId === params.agentId)) &&
      (!link.allowedTools.length ||
        link.allowedTools.includes(params.toolName)),
  );
  if (
    !granted ||
    (integration.tools.length &&
      !integration.tools.some(
        (tool) => tool.enabled && tool.name === params.toolName,
      ))
  )
    throw new Error(
      "This MCP tool is disabled or outside the current access scopes.",
    );
  if (params.agentId) {
    const agent = await db.query.agent.findFirst({
      where: and(
        eq(agentTable.id, params.agentId),
        eq(agentTable.organizationId, params.organizationId),
        eq(agentTable.isArchived, false),
      ),
    });
    const runtimeName = `mcp_${integration.id.replaceAll("-", "_")}_${params.toolName.replaceAll(/[^a-zA-Z0-9_]/g, "_")}`;
    if (
      !agent ||
      (agent.toolAccessMode === "allowlist" &&
        !agent.defaultToolIds?.some(
          (id) =>
            id === integration.id ||
            id === `mcp:${integration.id}` ||
            id === runtimeName,
        ))
    )
      throw new Error(
        "This agent's current tool policy does not allow the requested MCP tool.",
      );
  }
  return integration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
