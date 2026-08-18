import { db } from "@/db";
import { mcpIntegration, mcpTool } from "@/db/schema";
import { createHumanApprovalRequest } from "@/lib/ai/tools/request-human-approval";
import type { ActorContext, ChatMessage } from "@/lib/types";
import { validateMcpEndpoint } from "@/lib/mcp/endpoint";
import { parseRpcResponse, parseSseEvents } from "@/lib/mcp/protocol";
import {
	dynamicTool,
	jsonSchema,
	type ToolSet,
	type UIMessageStreamWriter,
} from "ai";
import { and, eq } from "drizzle-orm";

const MCP_PROTOCOL_VERSION = "2025-06-18";
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
	private initialized = false;
	private sessionId: string | undefined;
	private messageEndpoint: string | undefined;

	constructor(
		private readonly integration: typeof mcpIntegration.$inferSelect,
	) {}

	async listTools(): Promise<McpTool[]> {
		await this.initialize();
		const response = await this.request("tools/list", {});
		return response.tools ?? [];
	}

	async callTool(name: string, input: Record<string, unknown>) {
		await this.initialize();
		const response = await this.request("tools/call", {
			name,
			arguments: input,
		});
		return response.content ?? response;
	}

	private async initialize(): Promise<void> {
		if (this.initialized) return;

		if (this.integration.transport === "sse") {
			this.messageEndpoint = await this.openSseEndpoint();
		}

		await this.request("initialize", {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "circulo", version: "0.1.0" },
		});
		await this.notify("notifications/initialized", {});
		this.initialized = true;
	}

	private async openSseEndpoint(): Promise<string> {
		const endpoint = await validateMcpEndpoint(this.integration.endpoint);
		const response = await fetch(endpoint, {
			method: "GET",
			headers: this.headers("text/event-stream"),
			signal: AbortSignal.timeout(20_000),
		});
		if (!response.ok) {
			throw new Error(`MCP SSE handshake failed with HTTP ${response.status}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error("MCP SSE handshake returned no response body");

		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const events = parseSseEvents(buffer);
				for (const event of events) {
					if (event.event !== "endpoint") continue;
					const messageEndpoint = new URL(event.data, endpoint).toString();
					return await validateMcpEndpoint(messageEndpoint);
				}
				// Keep only the final incomplete SSE block for the next chunk.
				const separators = [...buffer.matchAll(/\r?\n\r?\n/g)];
				const lastSeparator = separators.at(-1);
				if (lastSeparator?.index !== undefined) {
					buffer = buffer.slice(lastSeparator.index + lastSeparator[0].length);
				}
			}
		} finally {
			await reader.cancel().catch(() => undefined);
		}

		throw new Error("MCP SSE handshake did not provide a message endpoint");
	}

	private async notify(method: string, params: Record<string, unknown>) {
		await this.request(method, params, false);
	}

	private async request(
		method: string,
		params: Record<string, unknown>,
		expectsResponse = true,
	) {
		const endpoint = await validateMcpEndpoint(
			this.messageEndpoint ?? this.integration.endpoint,
		);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: this.headers("application/json, text/event-stream"),
			body: JSON.stringify({
				jsonrpc: "2.0",
				...(expectsResponse ? { id: crypto.randomUUID() } : {}),
				method,
				params,
			}),
			signal: AbortSignal.timeout(20_000),
		});

		this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;

		if (!response.ok && response.status !== 202) {
			throw new Error(`MCP request failed with HTTP ${response.status}`);
		}
		if (!expectsResponse || response.status === 202) return {};

		const payload = parseRpcResponse(await response.text());
		if (payload.error?.message) {
			throw new Error(
				`MCP error ${payload.error.code ?? "unknown"}: ${payload.error.message}`,
			);
		}
		return payload.result ?? {};
	}

	private headers(accept: string): Record<string, string> {
		const credential = getCredential(this.integration.credentialRef);
		return {
			Accept: accept,
			"Content-Type": "application/json",
			"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
			...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
			...(credential ? { Authorization: `Bearer ${credential}` } : {}),
		};
	}
}

export async function getMcpToolsForAgent(params: {
	organizationId: string;
	chatId: string;
	agentId?: string;
	session: ActorContext;
	workflowId: string;
	dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<ToolSet> {
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
				console.error("[MCP] unable to list tools", {
					integrationId: integration.id,
					error,
				});
				continue;
			}
		}

		const allowedTools = new Set(links.flatMap((link) => link.allowedTools));
		const hasAllowList = links.some((link) => link.allowedTools.length > 0);
		for (const remoteTool of available) {
			if (hasAllowList && !allowedTools.has(remoteTool.name)) continue;
			const readOnlyHint =
				remoteTool.readOnlyHint ?? remoteTool.annotations?.readOnlyHint ?? null;
			const approvalMode = remoteTool.approvalMode ?? "prompt";
			const name = `mcp_${integration.id.replaceAll("-", "_")}_${remoteTool.name.replaceAll(/[^a-zA-Z0-9_]/g, "_")}`;
			tools[name] = dynamicTool({
				description:
					(remoteTool.title ? `${remoteTool.title}: ` : "") +
					(remoteTool.description ??
						`MCP tool ${remoteTool.name} from ${integration.name}`),
				inputSchema: jsonSchema(
					remoteTool.inputSchema ?? {
						type: "object",
						additionalProperties: true,
					},
				),
				execute: async (input) => {
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
					return client.callTool(remoteTool.name, isRecord(input) ? input : {});
				},
			});
		}
	}

	return tools;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
