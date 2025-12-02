import { message } from "@/db";
import { messageRepo } from "@/db/repositories";
import { myProvider } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
  CustomUIMessageChunk,
} from "@/lib/types";
import { convertToUIMessages } from "@/lib/utils";
import { ChatContext } from "@/workflows/orchestrate/steps/load-chat-step";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { DurableAgent } from "@workflow/ai/agent";
import {
  convertToModelMessages,
  ModelMessage,
  UIMessagePart,
  UIMessageStreamWriter,
} from "ai";
import { Session } from "better-auth";
import { getWritable } from "workflow";
import { ExecutionPlan } from "./plan-agent-execution-step";

export function toUIMessageStreamWriter(
  writable: WritableStream<CustomUIMessageChunk>,
): UIMessageStreamWriter<ChatMessage> {
  const writer = writable.getWriter();
  let chain = Promise.resolve();

  const streamWriter: UIMessageStreamWriter<ChatMessage> = {
    write(part) {
      chain = chain
        .then(() => writer.write(part as unknown as CustomUIMessageChunk))
        .catch((err) => streamWriter.onError?.(err));
    },

    merge(stream) {
      const reader = stream.getReader();
      chain = chain
        .then(async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value as CustomUIMessageChunk);
          }
        })
        .catch((err) => streamWriter.onError?.(err));
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
}

/**
 * Convert ModelMessage.content into:
 *  - flat string content (for messages.content)
 *  - UIMessagePart[] (for messages.parts)
 *
 * IMPORTANT:
 * Your app does NOT support a generic "data" UI part.
 * So we ONLY preserve:
 *   1) text parts
 *   2) tool-call / tool-result parts mapped to `tool-${name}`
 * Everything else is dropped.
 */
function modelContentToUIParts(raw: unknown): {
  content: string;
  parts: UIMessagePart<CustomUIDataTypes, ChatTools>[];
} {
  // If it's already a string, keep as one text part.
  if (typeof raw === "string") {
    return {
      content: raw,
      parts: [{ type: "text", text: raw }],
    };
  }

  if (!Array.isArray(raw)) {
    return { content: "", parts: [] };
  }

  const toolInputsById = new Map<string, unknown>();

  const parts = raw.flatMap(
    (part): UIMessagePart<CustomUIDataTypes, ChatTools>[] => {
      if (typeof part !== "object" || part === null) return [];

      const p = part as Record<string, unknown>;
      const type = p.type;

      // text
      if (type === "text" && typeof p.text === "string") {
        return [{ type: "text", text: p.text }];
      }

      // tool-call -> tool-${name} input-available
      if (
        type === "tool-call" &&
        typeof p.toolCallId === "string" &&
        typeof p.toolName === "string"
      ) {
        const toolCallId = p.toolCallId;
        const toolName = p.toolName;
        const input = p.args ?? p.input ?? {};

        toolInputsById.set(toolCallId, input);

        return [
          {
            type: `tool-${toolName}` as const,
            toolCallId,
            state: "input-available",
            input,
          },
        ];
      }

      // tool-result -> tool-${name} output-available / output-error
      if (
        type === "tool-result" &&
        typeof p.toolCallId === "string" &&
        typeof p.toolName === "string"
      ) {
        const toolCallId = p.toolCallId;
        const toolName = p.toolName;
        const output = p.result ?? p.output;
        const input = toolInputsById.get(toolCallId) ?? p.args ?? p.input ?? {};

        const isError =
          typeof p.isError === "boolean"
            ? p.isError
            : typeof p.errorText === "string";

        if (isError) {
          return [
            {
              type: `tool-${toolName}` as const,
              toolCallId,
              state: "output-error",
              input,
              errorText:
                (typeof p.errorText === "string" && p.errorText) ||
                "Tool error",
            },
          ];
        }

        return [
          {
            type: `tool-${toolName}` as const,
            toolCallId,
            state: "output-available",
            input,
            output,
          },
        ];
      }

      // Unknown part type -> drop (no generic data parts in your app)
      return [];
    },
  );

  const content = parts
    .filter(
      (
        pt,
      ): pt is UIMessagePart<CustomUIDataTypes, ChatTools> & {
        type: "text";
        text: string;
      } => pt.type === "text" && typeof (pt as any).text === "string",
    )
    .map((pt) => (pt as any).text as string)
    .join("\n");

  return { content, parts };
}

async function persistAgentMessages(params: {
  result: { messages: ModelMessage[] };
  modelHistory: ModelMessage[];
  agent: { id: string };
  context: ChatContext;
}) {
  "use step";

  const { result, modelHistory, agent, context } = params;

  const chatId =
    (context as { chatId?: string }).chatId ??
    (context as { chat?: { id?: string } }).chat?.id ??
    (context as { id?: string }).id;

  if (!chatId) return;

  type Insert = typeof message.$inferInsert;

  // --- canonical signatures for robust diffing ---
  const signatureOf = (m: ModelMessage): string => {
    const role = m.role;
    const raw = m.content;

    if (typeof raw === "string") return `${role}:${raw}`;

    if (Array.isArray(raw)) {
      // only text + tool parts matter for equality
      const stable = raw
        .filter(
          (p: any) =>
            p?.type === "text" ||
            p?.type?.startsWith("tool-") ||
            p?.type === "tool-call" ||
            p?.type === "tool-result",
        )
        .map((p: any) => {
          if (p.type === "text") return `text:${p.text}`;
          if (p.type === "tool-call")
            return `tool-call:${p.toolName}:${p.toolCallId}:${JSON.stringify(p.args ?? p.input ?? {})}`;
          if (p.type === "tool-result")
            return `tool-result:${p.toolName}:${p.toolCallId}:${JSON.stringify(p.result ?? p.output ?? {})}`;
          return "";
        })
        .join("|");

      return `${role}:${stable}`;
    }

    return `${role}:`;
  };

  const historySigs = new Set(modelHistory.map(signatureOf));

  // Only keep messages not already present in input history
  const trulyNew = result.messages.filter(
    (m) => !historySigs.has(signatureOf(m)),
  );

  // Optional extra guard: don’t insert duplicates vs DB tail
  const existingTail = await messageRepo.findLatestForChat(chatId, 20);
  const existingTailSigs = new Set(
    existingTail.map((m) => `${m.role}:${m.content}`),
  );

  const inserts: Insert[] = trulyNew.flatMap((m): Insert[] => {
    if (m.role !== "assistant" && m.role !== "tool") return [];

    const { content, parts } = modelContentToUIParts(m.content);

    // DB-tail guard (simple, not a hash)
    const tailSig = `${m.role}:${content}`;
    if (existingTailSigs.has(tailSig)) return [];

    if (m.role === "assistant") {
      return [
        {
          chatId,
          authorType: "agent",
          authorId: agent.id,
          role: "assistant",
          content,
          parts,
          attachments: [],
          tokenCount: 0,
          cost: "0",
          isDeleted: false,
        } satisfies Insert,
      ];
    }

    return [
      {
        chatId,
        authorType: "system",
        authorId: agent.id,
        role: "tool",
        content,
        parts,
        attachments: [],
        tokenCount: 0,
        cost: "0",
        isDeleted: false,
      } satisfies Insert,
    ];
  });

  if (inserts.length > 0) {
    await messageRepo.createMany(inserts);
  }
}

export async function executeAgentTaskStep(params: {
  session: Session;
  agentPlan: ExecutionPlan["selectedAgents"][0];
  context: ChatContext;
  previousResults: AgentExecutionResult[];
  webhookPayload?: OrchestrationInput["webhookPayload"];
}): Promise<AgentExecutionResult> {
  "use step";

  const { agentPlan, context, previousResults, webhookPayload, session } =
    params;
  const writable = getWritable<CustomUIMessageChunk>(); // the REAL workflow output
  const dataStream = toUIMessageStreamWriter(writable); // you + tools write here

  // Agent gets its own stream so it never locks the real one
  const agentStream = new TransformStream<
    CustomUIMessageChunk,
    CustomUIMessageChunk
  >();

  // Pipe agent output into the real workflow output
  dataStream.merge(agentStream.readable);

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

    // Build the system prompt
    const systemPrompt = `${instructions}

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

Provide a focused response for YOUR specific task. Be concise but complete.`;

    // Create durable agent
    const durableAgent = new DurableAgent({
      model: async () => myProvider.languageModel(agent.model),
      system: systemPrompt,
      tools: {
        createDocument: createDocument({
          session,
          dataStream,
        }),
        updateDocument: updateDocument({ session, dataStream }),
        requestSuggestions: requestSuggestions({
          session,
          dataStream,
        }),
      },
    });

    // Send agent started event
    await sendAgentStartEvent(dataStream, {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
    });

    const modelHistory = convertToModelMessages(
      convertToUIMessages(conversationHistory),
    );

    // Stream the agent response
    const result = await durableAgent.stream({
      messages: modelHistory,
      writable: agentStream.writable,
    });

    // CRITICAL: Extract the actual output from the messages array
    const assistantMessages = result.messages.filter(
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

    await persistAgentMessages({
      result,
      modelHistory,
      agent,
      context,
    });

    const endTime = new Date();

    // Send agent completed event
    await sendAgentCompletedEvent(dataStream, {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: true,
      output,
      durationMs: endTime.getTime() - startTime.getTime(),
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

    return {
      agentId: agent.id,
      agentName: agent.name,
      task: agentPlan.task,
      success: false,
      error: errorMessage,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
    };
  }
}

// Helper functions for sending events (NOT steps)
async function sendAgentStartEvent(
  dataStream: UIMessageStreamWriter<ChatMessage>,
  data: { agentId: string; agentName: string; task: string },
) {
  dataStream.write({
    type: "data-workflowAgentStarted",
    data,
  });
}

async function sendAgentCompletedEvent(
  dataStream: UIMessageStreamWriter<ChatMessage>,
  data: {
    agentId: string;
    agentName: string;
    task: string;
    success: boolean;
    output?: string;
    durationMs: number;
  },
) {
  dataStream.write({
    type: "data-workflowAgentCompleted",
    data: {
      agentId: data.agentId,
      agentName: data.agentName,
      task: data.task,
      success: data.success,
      startTime: new Date(),
      endTime: new Date(),
      durationMs: data.durationMs,
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
