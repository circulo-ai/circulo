import { readOpenRouterUsage } from "@/lib/ai/openrouter-client";
import { defaultModel, getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { handoffTask } from "@/lib/ai/tools/handoff-task";
import { requestHumanApproval } from "@/lib/ai/tools/request-human-approval";
import { rememberMemory } from "@/lib/ai/tools/remember-memory";
import { scheduleTask } from "@/lib/ai/tools/schedule-task";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { getMcpToolsForAgent } from "@/lib/mcp/client";
import type {
	ChatMessage,
	CustomUIMessageChunk,
	WorkflowAgentTrace,
	WorkflowToolTrace,
} from "@/lib/types";
import { convertToUIMessages, getTextFromMessages } from "@/lib/utils";
import type { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";
import { publishWorkflowChunk } from "@/workflows/runtime/output-channel";
import {
	convertToModelMessages,
	generateText,
	ToolLoopAgent,
	type ModelMessage,
	type UIMessageStreamWriter,
} from "ai";
import type { ExecutionPlan } from "./plan-agent-execution-step";

export function toUIMessageStreamWriter(
	workflowId: string,
): UIMessageStreamWriter<ChatMessage> {
	const streamWriter: UIMessageStreamWriter<ChatMessage> = {
		write(part) {
			publishWorkflowChunk(workflowId, part as unknown as CustomUIMessageChunk);
		},

		merge(stream) {
			void (async () => {
				try {
					const reader = stream.getReader();
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						publishWorkflowChunk(
							workflowId,
							value as unknown as CustomUIMessageChunk,
						);
					}
				} catch (error) {
					streamWriter.onError?.(error);
				}
			})();
		},

		onError: undefined,
	};

	return streamWriter;
}

export interface AgentExecutionResult {
	agentId: string;
	agentName: string;
	task: string;
	success: boolean;
	output?: string; // CRITICAL: Must capture the actual output
	error?: string;
	startTime: Date;
	endTime: Date;
	durationMs: number;
	tokenCount?: number;
	cost?: number;
	model?: string;
	avatarUrl?: string | null;
	toolCalls?: WorkflowToolTrace[];
	approvalId?: string;
}

export async function executeDirectResponseStep(params: {
	context: ChatContext;
	inputMessages: ChatMessage[];
	workflowId: string;
}): Promise<AgentExecutionResult> {
	const startTime = new Date();
	const modelMessages = await convertToModelMessages(
		convertToUIMessages(params.context.messages),
	);
	const result = await generateText({
		model: getLanguageModel(),
		system: buildSharedContextPrompt(
			params.context,
			"You are Circulo, the default assistant. Answer the user's request directly, clearly, and accurately. No specialist agent was selected, so complete the task yourself.",
		),
		messages: modelMessages,
	});
	const usage = await result.usage;
	const providerUsage = readOpenRouterUsage(await result.providerMetadata);
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const tokenCount = providerUsage?.totalTokens ?? inputTokens + outputTokens;
	const cost = providerUsage?.cost ?? 0;
	const dataStream = toUIMessageStreamWriter(params.workflowId);
	dataStream.write({
		type: "data-usage",
		data: {
			inputTokens,
			outputTokens,
			totalTokens: tokenCount,
			modelId: defaultModel,
			cost,
			inputTokenDetails: usage.inputTokenDetails,
			outputTokenDetails: usage.outputTokenDetails,
		},
	});

	const endTime = new Date();
	return {
		agentId: "circulo-default",
		agentName: "Circulo",
		task: getTextFromMessages(params.inputMessages),
		success: true,
		output: result.text,
		startTime,
		endTime,
		durationMs: endTime.getTime() - startTime.getTime(),
		tokenCount,
		cost,
		model: defaultModel,
		avatarUrl: null,
	};
}

function buildSharedContextPrompt(
	context: ChatContext,
	basePrompt: string,
): string {
	const memories = context.memories
		.slice(0, 100)
		.map((item) => `[${item.scope}] ${item.key}: ${item.content}`)
		.join("\n");
	const knowledge = context.knowledgeDocuments
		.slice(0, 50)
		.map(
			(document) =>
				`[${document.knowledgeBaseName}] ${document.title}${document.sourceKey ? ` (source: ${document.sourceKey})` : ""}\n${document.content}`,
		)
		.join("\n\n");
	const skills = context.skills
		.slice(0, 50)
		.map(
			(skill) =>
				`[${skill.name} v${skill.version}]${skill.description ? ` ${skill.description}` : ""}\n${skill.instructions}`,
		)
		.join("\n\n");
	const participants = context.members
		.map((member) => `${member.user.name} (${member.userId})`)
		.join(", ");
	const conversation = context.messages
		.slice(-20)
		.map((message) => {
			const author =
				message.authorType === "agent"
					? (context.agents.find((item) => item.agentId === message.authorId)
							?.agent.name ?? "Agent")
					: message.authorType === "user"
						? (context.members.find((item) => item.userId === message.authorId)
								?.user.name ?? "Human member")
						: "System";
			return `${author} [${message.role}]: ${getStoredMessageText(message)}`;
		})
		.filter((line) => line.trim().length > 0)
		.join("\n");
	const pastConversation = context.pastMessages
		.slice(0, 30)
		.map((message) => `${message.role}: ${getStoredMessageText(message)}`)
		.filter((line) => line.trim().length > 0)
		.join("\n");
	const sections = [basePrompt];
	if (participants) {
		sections.push(`=== CHAT PARTICIPANTS ===\n${participants}`);
	}
	if (conversation) {
		sections.push(
			`=== LABELED GROUP CHAT HISTORY ===\nEach line identifies its author. Do not attribute one member's words or permissions to another.\n${conversation}`,
		);
	}
	if (pastConversation) {
		sections.push(
			`=== RELEVANT PAST CHAT HISTORY ===\nThis is optional personalization context from other chats the current user can access. Do not expose it as a source or reveal private details unless relevant to the user's request.\n${pastConversation}`,
		);
	}
	if (memories) {
		sections.push(
			`=== PERSISTED MEMORY ===\nUse these saved facts only when relevant:\n${memories}`,
		);
	}
	if (knowledge) {
		sections.push(
			`=== KNOWLEDGE BASE CONTEXT ===\nUse these workspace documents as reference material. Do not claim facts that are not supported by the conversation or these documents:\n${knowledge.slice(0, 120_000)}`,
		);
	}
	if (skills) {
		sections.push(
			`=== ASSIGNED SKILLS ===\nThese are explicit organization-approved instruction bundles assigned to this chat or its agents. Follow them only within their stated scope:\n${skills.slice(0, 80_000)}`,
		);
	}
	return sections.join("\n\n");
}

function getStoredMessageText(
	message: ChatContext["messages"][number],
): string {
	if (Array.isArray(message.parts)) {
		return message.parts
			.filter(
				(part): part is { type: "text"; text: string } =>
					typeof part === "object" &&
					part !== null &&
					(part as { type?: unknown }).type === "text" &&
					typeof (part as { text?: unknown }).text === "string",
			)
			.map((part) => part.text)
			.join("");
	}
	return message.content ?? "";
}

export async function executeAgentTaskStep(params: {
	actor: OrchestrationInput["actor"];
	agentPlan: NonNullable<ExecutionPlan["selectedAgents"][number]>;
	context: ChatContext;
	previousResults: AgentExecutionResult[];
	webhookPayload?: OrchestrationInput["webhookPayload"];
	workflowId: string;
}): Promise<AgentExecutionResult> {
	const {
		agentPlan,
		context,
		previousResults,
		webhookPayload,
		actor,
		workflowId,
	} = params;
	const dataStream = toUIMessageStreamWriter(workflowId);

	const startTime = new Date();
	const chatAgent = context.agents.find((a) => a.agentId === agentPlan.agentId);

	if (!chatAgent) {
		return {
			agentId: agentPlan.agentId,
			agentName: "Unknown Agent",
			task: agentPlan.task,
			success: false,
			error: "Agent not found in chat",
			startTime,
			endTime: new Date(),
			durationMs: 0,
			model: undefined,
			avatarUrl: null,
		};
	}

	const agent = chatAgent.agent;

	try {
		// Build context from previous results
		let previousContext = "";
		if (previousResults.length > 0) {
			previousContext =
				"\n\n=== PREVIOUS AGENT OUTPUTS ===\n" +
				"These agents have already worked on this request. Use their outputs:\n\n" +
				previousResults
					.map((r, idx) => {
						const status = r.success ? "✓ SUCCESS" : "✗ FAILED";
						return `[Agent ${idx + 1}] ${r.agentName} (${status})
Task: ${r.task}
Output: ${r.output || "No output"}
${r.error ? `Error: ${r.error}` : ""}
---`;
					})
					.join("\n\n");
		}

		// Build webhook context
		let webhookContext = "";
		if (webhookPayload) {
			webhookContext = `\n\n=== WEBHOOK EVENT TRIGGER ===
Source: ${webhookPayload.source}
Event: ${webhookPayload.event}
Data: ${JSON.stringify(webhookPayload.data, null, 2)}
---`;
		}

		// Get conversation history (last 20 messages)
		const conversationHistory = context.messages.slice(-20);

		// Use custom instructions if available
		const instructions = chatAgent.customInstructions || agent.instructions;
		const chatInstructions = context.chat.instructions?.trim();

		// Build the system prompt
		const systemPrompt = buildSharedContextPrompt(
			context,
			`${instructions}
${chatInstructions ? `\n=== CHAT RULES AND INSTRUCTIONS ===\n${chatInstructions}` : ""}

=== YOUR ASSIGNED TASK ===
${agentPlan.task}

=== EXECUTION CONTEXT ===
You are Agent #${previousResults.length + 1} in a multi-agent workflow.
Strategy: ${agentPlan.priority} priority
${previousResults.length > 0 ? `Previous agents have completed ${previousResults.length} task(s) before you.` : "You are the first agent."}
${agentPlan.dependsOn && agentPlan.dependsOn.length > 0 ? `\nYour work depends on: ${agentPlan.dependsOn.length} previous agent(s)` : ""}

=== INSTRUCTIONS ===
1. Review the original user request carefully
2. ${previousResults.length > 0 ? "Consider the outputs from previous agents - build upon their work" : "Start fresh"}
3. Focus on your assigned task: "${agentPlan.task}"
4. Provide clear, actionable output
5. If building on previous work, reference it explicitly
${webhookContext}${previousContext}

Provide a focused response for YOUR specific task. Be concise but complete.`,
		);

		// The application workflow engine owns orchestration durability. AI SDK's
		// ToolLoopAgent owns the model/tool loop within this workflow step.
		const mcpTools = await getMcpToolsForAgent({
			organizationId: actor.organizationId ?? context.chat.organizationId,
			chatId: context.chat.id,
			agentId: agent.id,
			session: actor,
			workflowId,
			dataStream,
		});

		const agentLoop = new ToolLoopAgent({
			model: getLanguageModel(agent.model),
			instructions: systemPrompt,
			maxOutputTokens: agent.maxTokens ?? undefined,
			temperature: normalizeTemperature(
				chatAgent.customTemperature ?? agent.temperature,
			),
			tools: {
				createDocument: createDocument({
					session: actor,
					dataStream,
				}),
				updateDocument: updateDocument({ session: actor, dataStream }),
				requestSuggestions: requestSuggestions({
					session: actor,
					dataStream,
				}),
				...mcpTools,
				requestHumanApproval: requestHumanApproval({
					session: actor,
					chatId: context.chat.id,
					workflowRunId: workflowId,
					dataStream,
				}),
				rememberMemory: rememberMemory({
					session: actor,
					chatId: context.chat.id,
					dataStream,
				}),
				scheduleTask: scheduleTask({
					session: actor,
					chatId: context.chat.id,
					dataStream,
				}),
				handoffTask: handoffTask({
					session: actor,
					chatId: context.chat.id,
					workflowRunId: workflowId,
					fromAgentId: agent.id,
					dataStream,
				}),
			},
		});

		// Send agent started event
		await sendAgentStartEvent(dataStream, {
			agentId: agent.id,
			agentName: agent.name,
			task: agentPlan.task,
			model: agent.model,
			avatarUrl: agent.avatarUrl,
			status: "running",
			startedAt: startTime.toISOString(),
		});

		const modelHistory = await convertToModelMessages(
			convertToUIMessages(conversationHistory),
		);

		// Stream the agent response
		const result = await agentLoop.stream({
			messages: modelHistory,
		});

		// Consume the model stream so tool calls execute, but keep the transport
		// contract to one assistant message. Tool calls are represented in the
		// durable workflow trace below instead of creating transient messages.
		let streamedOutput = "";
		for await (const chunk of result.toUIMessageStream<ChatMessage>({
			sendFinish: false,
		})) {
			if (chunk.type === "text-delta") {
				streamedOutput += chunk.delta;
				dataStream.write({
					type: "data-workflowAgentProgress",
					data: {
						agentId: agent.id,
						progress: streamedOutput,
						timestamp: new Date().toISOString(),
					},
				});
			}
		}

		// CRITICAL: Extract the actual output from the messages array
		const response = await result.response;
		const usage = await result.usage;
		const providerUsage = readOpenRouterUsage(await result.providerMetadata);
		const inputTokens =
			typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
		const outputTokens =
			typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
		const tokenCount = providerUsage?.totalTokens ?? inputTokens + outputTokens;
		const cost = providerUsage?.cost ?? 0;

		dataStream.write({
			type: "data-usage",
			data: {
				inputTokens,
				outputTokens,
				totalTokens: tokenCount,
				modelId: agent.model,
				cost,
				inputTokenDetails: usage.inputTokenDetails,
				outputTokenDetails: usage.outputTokenDetails,
			},
		});
		const assistantMessages = response.messages.filter(
			(msg) => msg.role === "assistant",
		);
		const lastAssistantMessage =
			assistantMessages[assistantMessages.length - 1];

		// Extract text content from the message
		let output = "";
		if (lastAssistantMessage) {
			if (typeof lastAssistantMessage.content === "string") {
				output = lastAssistantMessage.content;
			} else if (Array.isArray(lastAssistantMessage.content)) {
				output = lastAssistantMessage.content
					.filter((part: any) => part.type === "text")
					.map((part: any) => part.text)
					.join("\n");
			}
		}

		const endTime = new Date();
		const toolCalls = extractToolTraces(response.messages);
		const approvalId = findPendingApprovalId(toolCalls);

		// Send agent completed event
		await sendAgentCompletedEvent(dataStream, {
			agentId: agent.id,
			agentName: agent.name,
			task: agentPlan.task,
			output,
			durationMs: endTime.getTime() - startTime.getTime(),
			model: agent.model,
			avatarUrl: agent.avatarUrl,
			toolCalls,
			status: "completed",
			startedAt: startTime.toISOString(),
			completedAt: endTime.toISOString(),
		});

		return {
			agentId: agent.id,
			agentName: agent.name,
			task: agentPlan.task,
			success: true,
			output,
			startTime,
			endTime,
			durationMs: endTime.getTime() - startTime.getTime(),
			model: agent.model,
			avatarUrl: agent.avatarUrl,
			toolCalls,
			approvalId,
		};
	} catch (error) {
		const endTime = new Date();
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Send error event
		await sendAgentErrorEvent(dataStream, {
			agentId: agent.id,
			agentName: agent.name,
			error: errorMessage,
		});
		await sendAgentCompletedEvent(dataStream, {
			agentId: agent.id,
			agentName: agent.name,
			task: agentPlan.task,
			error: errorMessage,
			durationMs: endTime.getTime() - startTime.getTime(),
			model: agent.model,
			avatarUrl: agent.avatarUrl,
			status: "failed",
			startedAt: startTime.toISOString(),
			completedAt: endTime.toISOString(),
		});

		return {
			agentId: agent.id,
			agentName: agent.name,
			task: agentPlan.task,
			success: false,
			error: errorMessage,
			startTime,
			endTime,
			durationMs: endTime.getTime() - startTime.getTime(),
			model: agent.model,
			avatarUrl: agent.avatarUrl,
		};
	}
}

function normalizeTemperature(
	value: number | null | undefined,
): number | undefined {
	if (value === null || value === undefined) return undefined;
	return Math.min(1, Math.max(0, value / 100));
}

// Helper functions for sending events (NOT steps)
async function sendAgentStartEvent(
	dataStream: UIMessageStreamWriter<ChatMessage>,
	data: WorkflowAgentTrace,
) {
	dataStream.write({
		type: "data-workflowAgentStarted",
		data,
	});
}

async function sendAgentCompletedEvent(
	dataStream: UIMessageStreamWriter<ChatMessage>,
	data: WorkflowAgentTrace,
) {
	dataStream.write({
		type: "data-workflowAgentCompleted",
		data: {
			agentId: data.agentId,
			agentName: data.agentName,
			task: data.task,
			status: data.status,
			startedAt: data.startedAt,
			completedAt: data.completedAt,
			durationMs: data.durationMs,
			model: data.model,
			avatarUrl: data.avatarUrl,
			output: data.output,
			error: data.error,
			toolCalls: data.toolCalls,
		},
	});
}

async function sendAgentErrorEvent(
	dataStream: UIMessageStreamWriter<ChatMessage>,
	data: { agentId: string; agentName: string; error: string },
) {
	dataStream.write({
		type: "data-workflowError",
		data: {
			error: data.error,
			agentId: data.agentId,
		},
	});
}

function extractToolTraces(messages: ModelMessage[]): WorkflowToolTrace[] {
	const traces = new Map<string, WorkflowToolTrace>();

	for (const message of messages) {
		if (!Array.isArray(message.content)) continue;

		for (const part of message.content as Array<Record<string, unknown>>) {
			if (part.type === "tool-call" && typeof part.toolCallId === "string") {
				traces.set(part.toolCallId, {
					toolCallId: part.toolCallId,
					toolName: String(part.toolName ?? "tool"),
					input: part.args ?? part.input,
					status: "completed",
				});
			}

			if (part.type === "tool-result" && typeof part.toolCallId === "string") {
				const current = traces.get(part.toolCallId) ?? {
					toolCallId: part.toolCallId,
					toolName: String(part.toolName ?? "tool"),
					status: "completed" as const,
				};
				const isError = Boolean(part.isError || part.errorText);
				traces.set(part.toolCallId, {
					...current,
					output: part.result ?? part.output,
					error: isError ? String(part.errorText ?? "Tool error") : undefined,
					status: isError ? "error" : "completed",
				});
			}
		}
	}

	return [...traces.values()];
}

function findPendingApprovalId(
	toolCalls: WorkflowToolTrace[],
): string | undefined {
	const approvalCall = toolCalls.find(
		(toolCall) =>
			typeof toolCall.output === "object" &&
			toolCall.output !== null &&
			typeof (toolCall.output as { approvalId?: unknown }).approvalId ===
				"string" &&
			(toolCall.output as { status?: unknown }).status === "pending",
	);
	if (!approvalCall) return undefined;

	const output = approvalCall.output as {
		approvalId?: unknown;
		status?: unknown;
	};
	return output.status === "pending" && typeof output.approvalId === "string"
		? output.approvalId
		: undefined;
}
