import type { Agent, ChatAgent } from "@/db";
import {
  orchestrationFallbackModel,
  withModelFallback,
} from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import type { OrchestrationInput } from "@/workflows/orchestrate/types";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getExplicitlyMentionedAgentIds } from "../agent-engagement";
import type { OrchestrationAgentProfile } from "../orchestration-agent-profile";
import { formatOrchestrationAgentProfile } from "../orchestration-agent-profile";
import type { RequestClassification } from "./classify-request-step";

const executionPlanSchema = z.object({
  strategy: z.enum(["sequential", "parallel", "conditional", "single"]),
  reasoning: z.string().describe("Explain the orchestration strategy chosen"),
  stopOnError: z.boolean().describe("Whether to stop if an agent fails"),
  selectedAgents: z.array(
    z.object({
      agentId: z.uuid(),
      order: z.number().describe("Execution order (0-based)"),
      // Azure/OpenAI strict structured output requires every property to be
      // required. Nullable fields preserve the planner's ability to express
      // that a dependency or parallel group is not applicable.
      parallelGroup: z
        .union([z.number(), z.null()])
        .describe("Agents in same group run in parallel, or null"),
      dependsOn: z
        .union([z.array(z.uuid()), z.null()])
        .describe("Agent IDs this depends on, or null"),
      reason: z.string().describe("Why this agent was selected"),
      task: z.string().describe("Specific task for this agent"),
      estimatedDuration: z
        .union([z.string(), z.null()])
        .describe("Estimated time (e.g., '30s', '2m'), or null"),
      priority: z.enum(["low", "medium", "high"]),
    }),
  ),
  fallbackAgentId: z
    .union([z.uuid(), z.null()])
    .describe("Fallback agent if primary fails, or null"),
  timeoutMinutes: z.number().describe("Maximum execution time in minutes"),
});

export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

export async function planAgentExecutionStep(params: {
  userId: string;
  classification: RequestClassification;
  agents: Array<ChatAgent & { agent: Agent }>;
  triggerMessages: ChatMessage[];
  mentions?: OrchestrationInput["mentions"];
  webhookPayload?: OrchestrationInput["webhookPayload"];
  orchestrationAgent?: OrchestrationAgentProfile | null;
  orchestrationModel?: string | null;
  orchestrationFallbackModel?: string | null;
}): Promise<ExecutionPlan> {
  const { classification, triggerMessages, webhookPayload } = params;
  const agents = params.agents.filter(
    (candidate) => candidate.agentId !== params.orchestrationAgent?.id,
  );

  if (agents.length === 0) {
    return {
      strategy: "single",
      reasoning:
        "No specialist agents are configured; use the default assistant.",
      stopOnError: true,
      selectedAgents: [],
      fallbackAgentId: null,
      timeoutMinutes: 10,
    };
  }

  // Build agent catalog
  const agentDescriptions = agents
    .map((ca, idx) => {
      const agent = ca.agent;
      const customInstructions = ca.customInstructions || agent.instructions;

      return `Agent ${idx + 1}:
  ID: ${agent.id}
  Name: ${agent.name}
  Description: ${agent.description || "No description"}
  Instructions: ${customInstructions.substring(0, 200)}...
  Model: ${agent.model}
  Temperature: ${ca.customTemperature ?? agent.temperature}
  Enabled: ${ca.isEnabled}`;
    })
    .join("\n\n");

  // Build webhook context if applicable
  let webhookContext = "";
  if (webhookPayload) {
    webhookContext = `\n\nWEBHOOK EVENT CONTEXT:
Source: ${webhookPayload.source}
Event: ${webhookPayload.event}
This is an automated trigger, not a direct user request.`;
  }

  const { output } = await withModelFallback({
    userId: params.userId,
    providerId: params.orchestrationAgent?.providerId,
    modelId: params.orchestrationAgent?.model ?? params.orchestrationModel,
    fallbackModelId:
      params.orchestrationFallbackModel ?? orchestrationFallbackModel,
    run: (model) =>
      generateText({
        model,
        output: Output.object({ schema: executionPlanSchema }),
        system: `${formatOrchestrationAgentProfile(params.orchestrationAgent)}${params.orchestrationAgent ? "\n\n" : ""}You are an expert orchestration planner for a multi-agent AI system.

Your task is to:
1. Select the best agent(s) for the classified request
2. Determine execution strategy (sequential, parallel, conditional, or single)
3. Define execution order and dependencies
4. Assign specific tasks to each agent
5. Estimate execution time

AVAILABLE AGENTS:
${agentDescriptions}

REQUEST CLASSIFICATION:
Intent: ${classification.intent}
Complexity: ${classification.complexity}
Domains: ${classification.domains.join(", ")}
Requires Multiple Agents: ${classification.requiresMultipleAgents}
Estimated Steps: ${classification.estimatedSteps}
Urgency: ${classification.urgency}
Key Entities: ${classification.keyEntities.join(", ")}${webhookContext}

EXECUTION STRATEGIES:
- "single": Use one agent for simple, focused tasks
- "sequential": Agents execute one after another (use when output of one is input to next)
  * Each agent sees outputs from ALL previous agents
  * Agent N can build upon work from agents 1 through N-1
- "parallel": Multiple agents work simultaneously (use for independent subtasks)
  * Agents in same parallelGroup run together
  * Use different parallelGroup numbers for stages (0, 1, 2, etc.)
- "conditional": Complex dependency graph (use when agents depend on specific prior outputs)
  * Use "dependsOn" to specify exact agent dependencies
  * Agent will only execute after its dependencies succeed
  * If dependency fails, dependent agent is skipped

DEPENDENCY RULES FOR "CONDITIONAL" STRATEGY:
- Use "dependsOn" array to specify which agents must complete first
- List agent IDs that this agent's work depends on
- Be specific: only list agents whose outputs are actually needed
- Avoid circular dependencies (A depends on B, B depends on A)
- Agent with no dependencies will run first
- Agent depending on multiple agents waits for ALL of them

EXAMPLE - Sequential (each agent builds on previous):
  Agent 1: "Analyze the data" (order: 0)
  Agent 2: "Create visualizations from the analysis" (order: 1)
  Agent 3: "Write summary report using analysis and visualizations" (order: 2)

EXAMPLE - Parallel with stages:
  Agent 1: "Fetch user data" (order: 0, parallelGroup: 0)
  Agent 2: "Fetch product data" (order: 0, parallelGroup: 0)
  Agent 3: "Analyze combined data" (order: 1, parallelGroup: 1) - runs after both fetches

EXAMPLE - Conditional with dependencies:
  Agent 1: "Research topic" (no dependencies)
  Agent 2: "Write outline" (dependsOn: [agent1.id])
  Agent 3: "Find sources" (dependsOn: [agent1.id])
  Agent 4: "Write draft" (dependsOn: [agent2.id, agent3.id])

RULES:
- Only select enabled agents
- Match agent capabilities to required domains
- For webhook events, consider automation and monitoring agents
- The orchestration controller can answer requests about workflow design, orchestration, agents, tools, MCP, planning, and harness behavior itself. Prefer no specialist agents for those requests unless the user explicitly names one or the request clearly requires its distinct capability.
- Never create a handoff merely because another agent exists. A handoff is justified only when the assigned task requires a capability you do not have or the user explicitly requests another participant.
- Prefer simpler strategies when possible
- Set realistic timeout based on complexity
- Assign clear, specific tasks to each agent
- Make sure tasks don't overlap unnecessarily
- In sequential mode, explicitly state how each agent should use previous outputs
- Return every schema property. Use null for parallelGroup, dependsOn,
  estimatedDuration, or fallbackAgentId when it does not apply; do not omit
  those properties.`,
        prompt: `User's request: "${getTextFromMessages(triggerMessages)}"

Classification reasoning: ${classification.reasoning}

    Plan the optimal agent orchestration.`,
      }),
  });

  // Validate that selected agents exist and are enabled
  const validAgentIds = new Set(
    agents.filter((a) => a.isEnabled).map((a) => a.agentId),
  );

  const validatedAgents = output.selectedAgents.filter((sa) => {
    if (!validAgentIds.has(sa.agentId)) {
      console.warn(`Agent ${sa.agentId} not found or disabled, skipping`);
      return false;
    }
    return true;
  });

  // An explicit @agent-id mention is an execution directive, not merely
  // prompt text. Preserve it even if the planner would otherwise choose a
  // different specialist.
  const requestText = getTextFromMessages(triggerMessages);
  const explicitlyMentionedIds = new Set(
    getExplicitlyMentionedAgentIds(triggerMessages, agents, params.mentions),
  );
  const explicitlyMentioned = agents.filter((chatAgent) =>
    explicitlyMentionedIds.has(chatAgent.agentId),
  );
  const selectedIds = new Set(validatedAgents.map((agent) => agent.agentId));
  for (const chatAgent of explicitlyMentioned) {
    if (selectedIds.has(chatAgent.agentId)) continue;
    validatedAgents.push({
      agentId: chatAgent.agentId,
      order: validatedAgents.length,
      parallelGroup: null,
      dependsOn: null,
      reason: "Explicitly mentioned by the user",
      task: requestText,
      estimatedDuration: null,
      priority: "high",
    });
    selectedIds.add(chatAgent.agentId);
  }

  return {
    ...output,
    selectedAgents: validatedAgents,
  };
}
