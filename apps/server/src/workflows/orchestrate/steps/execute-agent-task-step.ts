import { db, workflowRunEvent } from "@/db";
import { normalizeAttachmentContext } from "@/lib/ai/attachment-context";
import { readOpenRouterUsage } from "@/lib/ai/openrouter-client";
import { defaultModel, getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getGithubTools } from "@/lib/ai/tools/github";
import { handoffTask } from "@/lib/ai/tools/handoff-task";
import { rememberMemory } from "@/lib/ai/tools/remember-memory";
import { requestHumanApproval } from "@/lib/ai/tools/request-human-approval";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { scheduleTask } from "@/lib/ai/tools/schedule-task";
import { searchKnowledge } from "@/lib/ai/tools/search-knowledge";
import { searchMemory } from "@/lib/ai/tools/search-memory";
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
  ToolLoopAgent,
  type ModelMessage,
  type UIMessageStreamWriter,
} from "ai";
import { and, eq } from "drizzle-orm";
import {
  getAllowedMcpIntegrationIds,
  hasAgentToolAccess,
} from "../tool-access";
import type { ExecutionPlan } from "./plan-agent-execution-step";

const durableUIWrites = new Map<string, Promise<void>>();
const AGENT_EXECUTION_EVENT = "agent.execution.completed";
const MAX_SYSTEM_CONTEXT_CHARACTERS = 160_000;
const MAX_CONVERSATION_CONTEXT_CHARACTERS = 60_000;
const MAX_PAST_CONTEXT_CHARACTERS = 30_000;
const MAX_MEMORY_CONTEXT_CHARACTERS = 30_000;
const MAX_KNOWLEDGE_CONTEXT_CHARACTERS = 70_000;
const MAX_SKILL_CONTEXT_CHARACTERS = 45_000;

function limitContextLines(lines: string[], maxCharacters: number): string {
  const selected: string[] = [];
  let total = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    const remaining = maxCharacters - total;
    if (remaining <= 0) break;
    selected.unshift(line.length > remaining ? line.slice(-remaining) : line);
    total += Math.min(line.length, remaining);
    if (line.length > remaining) break;
  }
  return selected.join("\n");
}

function limitContextText(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) return value;
  const tailCharacters = Math.min(12_000, Math.floor(maxCharacters / 5));
  const headCharacters = maxCharacters - tailCharacters;
  return `${value.slice(0, headCharacters)}\n[Context truncated to protect the model context window.]\n${value.slice(-tailCharacters)}`;
}

export function toUIMessageStreamWriter(
  workflowId: string,
): UIMessageStreamWriter<ChatMessage> {
  const streamWriter: UIMessageStreamWriter<ChatMessage> = {
    write(part) {
      const chunk = part as unknown as CustomUIMessageChunk;
      persistDurableUIChunk(workflowId, chunk);
      publishWorkflowChunk(workflowId, chunk);
    },

    merge(stream) {
      void (async () => {
        try {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value as unknown as CustomUIMessageChunk;
            persistDurableUIChunk(workflowId, chunk);
            publishWorkflowChunk(workflowId, chunk);
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

function persistDurableUIChunk(
  workflowId: string,
  chunk: CustomUIMessageChunk,
): void {
  if (!isDurableUIChunk(chunk)) return;
  const previous = durableUIWrites.get(workflowId) ?? Promise.resolve();
  const next = previous.then(async () => {
    await db.insert(workflowRunEvent).values({
      id: crypto.randomUUID(),
      workflowId,
      timestamp: Date.now(),
      eventType: "ui.chunk",
      payload: chunk as unknown as Record<string, unknown>,
    });
  });
  durableUIWrites.set(workflowId, next);
  void next.catch((error: unknown) => {
    console.error("[Workflow UI Chunk Persistence Error]", {
      workflowId,
      type: chunk.type,
      error,
    });
  });
}

/** Wait until all streamed tool/agent chunks have reached the durable log. */
export async function flushDurableUIChunks(workflowId: string): Promise<void> {
  const pending = durableUIWrites.get(workflowId);
  if (!pending) return;
  await pending;
  if (durableUIWrites.get(workflowId) === pending) {
    durableUIWrites.delete(workflowId);
  }
}

/**
 * A completed model/tool loop is a durable checkpoint. If a worker dies after
 * an agent finishes but before the parent workflow step commits, recovery can
 * reuse this result instead of calling the model and side-effecting tools a
 * second time.
 */
export function getAgentExecutionKey(
  agentPlan: ExecutionPlan["selectedAgents"][number],
): string {
  return [agentPlan.agentId, agentPlan.order, agentPlan.task].join("\u001f");
}

export async function loadDurableAgentResults(
  workflowId: string,
): Promise<Map<string, AgentExecutionResult>> {
  const rows = await db
    .select()
    .from(workflowRunEvent)
    .where(
      and(
        eq(workflowRunEvent.workflowId, workflowId),
        eq(workflowRunEvent.eventType, AGENT_EXECUTION_EVENT),
      ),
    );
  const results = new Map<string, AgentExecutionResult>();
  for (const row of rows) {
    const payload = row.payload as {
      key?: unknown;
      result?: unknown;
    };
    if (typeof payload.key !== "string") continue;
    const result = deserializeDurableAgentResult(payload.result);
    if (result) results.set(payload.key, result);
  }
  return results;
}

export async function persistDurableAgentResult(
  workflowId: string,
  key: string,
  result: AgentExecutionResult,
): Promise<void> {
  await db.insert(workflowRunEvent).values({
    id: crypto.randomUUID(),
    workflowId,
    timestamp: Date.now(),
    eventType: AGENT_EXECUTION_EVENT,
    payload: {
      key,
      result: {
        ...result,
        startTime: result.startTime.toISOString(),
        endTime: result.endTime.toISOString(),
      },
    },
  });
}

function deserializeDurableAgentResult(
  value: unknown,
): AgentExecutionResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<AgentExecutionResult> & {
    startTime?: unknown;
    endTime?: unknown;
  };
  if (
    typeof result.agentId !== "string" ||
    typeof result.agentName !== "string" ||
    typeof result.task !== "string" ||
    typeof result.success !== "boolean" ||
    typeof result.startTime !== "string" ||
    typeof result.endTime !== "string" ||
    typeof result.durationMs !== "number"
  )
    return null;
  const startTime = new Date(result.startTime);
  const endTime = new Date(result.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return null;
  }
  return { ...result, startTime, endTime } as AgentExecutionResult;
}

function isDurableUIChunk(chunk: CustomUIMessageChunk): boolean {
  const type = chunk.type as string;
  if (type === "data-workflowHeartbeat" || type === "data-usage") {
    return false;
  }
  if (type.startsWith("text-")) return true;
  return (
    type.startsWith("data-workflowAgent") ||
    type === "data-workflowPlanStep" ||
    type.startsWith("data-workflowLoop") ||
    type === "data-workflowApprovalRequested" ||
    type === "data-memoryUpdated" ||
    type === "data-scheduledTaskCreated" ||
    type === "data-workflowHandoffCreated" ||
    type.startsWith("tool-") ||
    type === "dynamic-tool"
  );
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
  actor: OrchestrationInput["actor"];
  context: ChatContext;
  inputMessages: ChatMessage[];
  workflowId: string;
}): Promise<AgentExecutionResult> {
  const startTime = new Date();
  const dataStream = toUIMessageStreamWriter(params.workflowId);
  const agentName = "Circulo";
  const task = getTextFromMessages(params.inputMessages);
  const mcpTools = await getMcpToolsForAgent({
    organizationId: params.actor.organizationId,
    chatId: params.context.chat.id,
    session: params.actor,
    workflowId: params.workflowId,
    dataStream,
  });
  const connectedAppTools = await getGithubTools({
    userId: params.actor.userId,
    organizationId: params.context.chat.organizationId,
    allowedConnectionIds: params.context.chat.connectedAppIds ?? [],
  });
  const tools = {
    createDocument: createDocument({
      session: { ...params.actor, chatId: params.context.chat.id },
      dataStream,
    }),
    updateDocument: updateDocument({
      session: { ...params.actor, chatId: params.context.chat.id },
      dataStream,
    }),
    requestSuggestions: requestSuggestions({
      session: params.actor,
      dataStream,
    }),
    searchKnowledge: searchKnowledge({
      organizationId: params.context.chat.organizationId,
      allowedKnowledgeBaseIds: params.context.knowledgeBaseIds,
    }),
    searchMemory: searchMemory({
      organizationId: params.context.chat.organizationId,
      userId: params.actor.userId,
      chatId: params.context.chat.id,
      ...params.context.memoryPolicy,
    }),
    requestHumanApproval: requestHumanApproval({
      session: params.actor,
      chatId: params.context.chat.id,
      workflowRunId: params.workflowId,
      dataStream,
    }),
    ...(params.context.memoryPolicy.canWritePersonalMemory
      ? {
          rememberMemory: rememberMemory({
            session: params.actor,
            chatId: params.context.chat.id,
            dataStream,
          }),
        }
      : {}),
    scheduleTask: scheduleTask({
      session: params.actor,
      chatId: params.context.chat.id,
      dataStream,
    }),
    ...connectedAppTools,
    ...mcpTools,
  };
  await sendAgentStartEvent(dataStream, {
    agentId: "circulo-default",
    agentName,
    task,
    model: defaultModel,
    status: "running",
    startedAt: startTime.toISOString(),
  });
  const modelMessages = withKnowledgeImageContext(
    await convertToModelMessages(
      await normalizeAttachmentContext(
        convertToUIMessages(params.context.messages),
      ),
    ),
    params.context,
  );
  const result = await new ToolLoopAgent({
    model: getLanguageModel(),
    instructions: buildSharedContextPrompt(
      params.context,
      "You are Circulo, the orchestration controller and default assistant. Answer the user's request directly, clearly, and accurately. Requests about workflow design, orchestration, agents, tools, MCP, planning, harness behavior, and chat coordination are within your responsibility. Do not hand off or involve a specialist unless the user explicitly names one or the request requires a capability unavailable to you. No specialist agent was selected, so complete the task yourself using only the tools provided in this run.",
    ),
    tools,
  }).stream({
    messages: modelMessages,
  });
  const streamedMessageId = crypto.randomUUID();
  let streamedText = "";
  dataStream.write({ type: "text-start", id: streamedMessageId });
  for await (const chunk of result.toUIMessageStream<ChatMessage>({
    sendFinish: false,
  })) {
    if (chunk.type !== "text-delta") continue;
    streamedText += chunk.delta;
    dataStream.write({
      type: "text-delta",
      id: streamedMessageId,
      delta: chunk.delta,
    });
  }
  dataStream.write({ type: "text-end", id: streamedMessageId });
  const steps = await result.steps;
  const response = await result.response;
  const resultText = await result.text;
  const responseMessages = steps.flatMap((step) => step.response.messages);
  const allResponseMessages = responseMessages.length
    ? responseMessages
    : response.messages;
  const toolCalls = extractToolTraces(allResponseMessages);
  const usage = await result.usage;
  const providerUsage = readOpenRouterUsage(await result.providerMetadata);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const tokenCount = providerUsage?.totalTokens ?? inputTokens + outputTokens;
  const cost = providerUsage?.cost ?? 0;
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
  await sendAgentCompletedEvent(dataStream, {
    agentId: "circulo-default",
    agentName,
    task,
    output: streamedText || resultText,
    durationMs: endTime.getTime() - startTime.getTime(),
    model: defaultModel,
    toolCalls,
    status: "completed",
    startedAt: startTime.toISOString(),
    completedAt: endTime.toISOString(),
  });
  return {
    agentId: "circulo-default",
    agentName,
    task,
    success: true,
    output: streamedText || resultText,
    startTime,
    endTime,
    durationMs: endTime.getTime() - startTime.getTime(),
    tokenCount,
    cost,
    model: defaultModel,
    avatarUrl: null,
    toolCalls,
  };
}

function buildSharedContextPrompt(
  context: ChatContext,
  basePrompt: string,
): string {
  const memories = limitContextLines(
    context.memories
      .slice(0, 100)
      .map((item) => `[${item.scope}] ${item.key}: ${item.content}`),
    MAX_MEMORY_CONTEXT_CHARACTERS,
  );
  const knowledge = limitContextLines(
    context.knowledgeDocuments
      .slice(0, 50)
      .map(
        (document) =>
          `[${document.knowledgeBaseName}] ${document.title}${document.sourceKey ? ` (source: ${document.sourceKey})` : ""}\n${document.content}${document.contentType.startsWith("image/") ? (document.imageDataUrl ? "\nVisual context is attached to this run." : "\nVisual context is stored but too large to inline for this run.") : ""}`,
      ),
    MAX_KNOWLEDGE_CONTEXT_CHARACTERS,
  );
  const skills = limitContextLines(
    context.skills
      .slice(0, 50)
      .map(
        (skill) =>
          `[${skill.name} v${skill.version}]${skill.description ? ` ${skill.description}` : ""}\n${skill.instructions}`,
      ),
    MAX_SKILL_CONTEXT_CHARACTERS,
  );
  const participants = context.members
    .map((member) => `${member.user.name} (${member.userId})`)
    .join(", ");
  const conversation = limitContextLines(
    context.messages
      .slice(-20)
      .map((message) => {
        const author =
          message.authorType === "agent"
            ? (context.agents.find((item) => item.agentId === message.authorId)
                ?.agent.name ?? "Agent")
            : message.authorType === "user"
              ? (context.members.find(
                  (item) => item.userId === message.authorId,
                )?.user.name ?? "Human member")
              : "System";
        return `${author} [${message.role}]: ${getStoredMessageText(message)}`;
      })
      .filter((line) => line.trim().length > 0),
    MAX_CONVERSATION_CONTEXT_CHARACTERS,
  );
  const pastConversation = limitContextLines(
    context.pastMessages
      .slice(0, 30)
      .map((message) => `${message.role}: ${getStoredMessageText(message)}`)
      .filter((line) => line.trim().length > 0),
    MAX_PAST_CONTEXT_CHARACTERS,
  );
  const sections = [basePrompt];
  sections.push(`=== CAPABILITY BOUNDARY ===
Only claim that an action was completed when the corresponding runtime tool returned a successful result. Never invent access to an app, integration, MCP server, file, memory store, schedule, or other harness. If the required capability is not represented by a tool in this run, say that it is unavailable and do not imply that the action happened.
When the user asks you to remember something, use the memory tool when it is available. When the user asks for a reminder, recurring task, monitoring check, or scheduled action, use scheduleTask when it is available. Report tool results accurately, including failures or approval requirements.`);
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
      `=== KNOWLEDGE BASE CONTEXT ===\nUse these workspace documents as reference material. Do not claim facts that are not supported by the conversation or these documents:\n${knowledge}`,
    );
  }
  if (skills) {
    sections.push(
      `=== ASSIGNED SKILLS ===\nThese are explicit organization-approved instruction bundles assigned to this chat or its agents. Follow them only within their stated scope:\n${skills}`,
    );
  }
  return limitContextText(sections.join("\n\n"), MAX_SYSTEM_CONTEXT_CHARACTERS);
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

function withKnowledgeImageContext(
  messages: ModelMessage[],
  context: ChatContext,
): ModelMessage[] {
  const imageParts: Array<{ type: "image"; image: string }> = [];
  let totalCharacters = 0;
  for (const document of context.knowledgeDocuments) {
    if (!document.imageDataUrl) continue;
    if (
      imageParts.length >= 3 ||
      totalCharacters + document.imageDataUrl.length > 6_000_000
    ) {
      break;
    }
    imageParts.push({ type: "image", image: document.imageDataUrl });
    totalCharacters += document.imageDataUrl.length;
  }
  if (imageParts.length === 0) return messages;

  return [
    ...messages,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Reference images from the assigned knowledge bases are attached below. Use them only when relevant to the user's request, and do not treat visual details as text unless you can actually inspect them.",
        },
        ...imageParts,
      ],
    },
  ];
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
    // Announce the agent before loading integrations, tools, or model context.
    // Those operations can be slow; the client must see active progress rather
    // than appearing frozen after the workflow start event.
    await sendAgentStartEvent(dataStream, {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      model: agent.model,
      avatarUrl: agent.avatarUrl,
      status: "running",
      startedAt: startTime.toISOString(),
    });

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
Output: ${(r.output || "No output").slice(0, 20_000)}
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
Data: ${JSON.stringify(webhookPayload.data, null, 2).slice(0, 20_000)}
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
      allowedIntegrationIds: getAllowedMcpIntegrationIds(
        agent.defaultToolIds,
        agent.toolAccessMode,
      ),
    });
    const hasToolAccess = (...ids: string[]) =>
      hasAgentToolAccess(agent.defaultToolIds, agent.toolAccessMode, ...ids);
    const connectedAppTools = hasToolAccess(
      "app:github",
      "githubListRepositories",
      "githubGetRepository",
      "githubSearchRepositories",
    )
      ? await getGithubTools({
          userId: actor.userId,
          organizationId: context.chat.organizationId,
          allowedConnectionIds: context.chat.connectedAppIds ?? [],
          allowedToolIds:
            agent.toolAccessMode === "all"
              ? undefined
              : (agent.defaultToolIds ?? []),
        })
      : {};
    const builtinTools = {
      ...(hasToolAccess("builtin:document-authoring", "createDocument")
        ? {
            createDocument: createDocument({
              session: { ...actor, chatId: context.chat.id },
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:document-authoring", "updateDocument")
        ? {
            updateDocument: updateDocument({
              session: { ...actor, chatId: context.chat.id },
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:suggestions", "requestSuggestions")
        ? {
            requestSuggestions: requestSuggestions({
              session: actor,
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:knowledge", "searchKnowledge")
        ? {
            searchKnowledge: searchKnowledge({
              organizationId: context.chat.organizationId,
              allowedKnowledgeBaseIds: context.knowledgeBaseIds,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:memory", "searchMemory")
        ? {
            searchMemory: searchMemory({
              organizationId: context.chat.organizationId,
              userId: actor.userId,
              chatId: context.chat.id,
              ...context.memoryPolicy,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:workflow-coordination", "requestHumanApproval")
        ? {
            requestHumanApproval: requestHumanApproval({
              session: actor,
              chatId: context.chat.id,
              workflowRunId: workflowId,
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:workflow-coordination", "scheduleTask")
        ? {
            scheduleTask: scheduleTask({
              session: actor,
              chatId: context.chat.id,
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:workflow-coordination", "handoffTask")
        ? {
            handoffTask: handoffTask({
              session: actor,
              chatId: context.chat.id,
              workflowRunId: workflowId,
              fromAgentId: agent.id,
              dataStream,
            }),
          }
        : {}),
      ...(hasToolAccess("builtin:memory", "rememberMemory") &&
      context.memoryPolicy.canWritePersonalMemory
        ? {
            rememberMemory: rememberMemory({
              session: actor,
              chatId: context.chat.id,
              dataStream,
            }),
          }
        : {}),
    };

    const agentLoop = new ToolLoopAgent({
      model: getLanguageModel(agent.model),
      instructions: systemPrompt,
      maxOutputTokens: agent.maxTokens ?? undefined,
      temperature: normalizeTemperature(
        chatAgent.customTemperature ?? agent.temperature,
      ),
      tools: { ...builtinTools, ...connectedAppTools, ...mcpTools },
    });

    const modelHistory = withKnowledgeImageContext(
      await convertToModelMessages(
        await normalizeAttachmentContext(
          convertToUIMessages(conversationHistory),
        ),
      ),
      context,
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
            agentName: agent.name,
            progress: streamedOutput,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // ToolLoopAgent keeps intermediate tool-call/tool-result messages in the
    // individual step responses. The aggregate response can contain only the
    // final assistant turn, which previously made successful tool executions
    // disappear from workflow traces even though their side effects committed.
    const response = await result.response;
    const steps = await result.steps;
    const responseMessages = steps.flatMap((step) => step.response.messages);
    const allResponseMessages = responseMessages.length
      ? responseMessages
      : response.messages;
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
    const assistantMessages = allResponseMessages.filter(
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
    const toolCalls = extractToolTraces(allResponseMessages);
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
