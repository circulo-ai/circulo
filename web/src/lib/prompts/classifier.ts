import { Agent, ChatAgent } from "@/db";
import { google } from "@ai-sdk/google";
import { logger } from "@trigger.dev/sdk";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Classification result schema
 *
 * Note: specialInstructions is optional to reflect real LLM output variability.
 * The classifier result will be validated with this schema at runtime.
 */
const PromptClassificationSchema = z.object({
  interactionType: z.enum([
    "direct_agent_call",
    "roundtable_discussion",
    "agent_debate",
    "sequential_analysis",
    "single_agent_task",
  ]),
  targetedAgents: z
    .array(z.string())
    .describe("Agent IDs or names specifically called; empty => all agents"),
  customOrder: z
    .boolean()
    .describe("True if user specified a particular order for responses"),
  suggestedOrder: z
    .array(z.string())
    .describe("Suggested order of agent names/IDs if custom order detected"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score from classifier"),
  reasoning: z.string().describe("Short explanation for the classification"),
  // make specialInstructions optional to be resilient to partial/missing LLM fields
  specialInstructions: z
    .object({
      skipRoundtable: z.boolean().optional(),
      maxAgents: z.number().int().min(1).optional(),
      requireConsensus: z.boolean().optional(),
      allowDisagreement: z.boolean().optional(),
    })
    .optional(),
});

export type PromptClassification = z.infer<typeof PromptClassificationSchema>;

/**
 * Default classification used as a safe fallback.
 */
export function defaultClassification(): PromptClassification {
  return {
    interactionType: "roundtable_discussion",
    targetedAgents: [],
    customOrder: false,
    suggestedOrder: [],
    confidence: 0.5,
    reasoning: "Default fallback classification",
    specialInstructions: {
      skipRoundtable: false,
      requireConsensus: false,
      allowDisagreement: true,
    },
  };
}

/**
 * Utility: find an agent by id or name
 */
export function getAgentByIdOrName(
  agents: Array<ChatAgent & Agent>,
  idOrName: string,
): (ChatAgent & Agent) | undefined {
  return agents.find(
    (a) => a.id === idOrName || a.name.toLowerCase() === idOrName.toLowerCase(),
  );
}

/**
 * Normalize suggested order (dedupe and keep only those present in agents).
 * Returns array of ids or names as provided in suggestedOrder (but deduped and filtered).
 */
function normalizeSuggestedOrder(
  suggestedOrder: string[],
  agents: Array<ChatAgent & Agent>,
) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of suggestedOrder) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;

    // allow either id or name; only include if it exists among available agents
    const found = agents.some(
      (a) => a.id === key || a.name.toLowerCase() === key.toLowerCase(),
    );
    if (found) {
      normalized.push(key);
      seen.add(key);
    } else {
      // keep unknown entries out but log for debugging
      logger.warn("Suggested order referenced unknown agent", {
        reference: key,
      });
    }
  }

  return normalized;
}

/**
 * Classify user prompt to determine how agents should respond.
 * Validates LLM output and falls back if needed.
 */
export async function classifyUserPrompt(
  userPrompt: string,
  availableAgents: Array<
    Pick<ChatAgent & Agent, "id" | "name" | "description">
  >,
  chatStyle: "brainstorm" | "debate" | "analyze" | "custom",
  chatInstructions?: string,
): Promise<PromptClassification> {
  try {
    logger.info("Classifying user prompt", {
      promptLength: userPrompt.length,
      agentCount: availableAgents.length,
      chatStyle,
    });

    const agentContext =
      availableAgents.length > 0
        ? availableAgents
            .map((agent) => {
              let desc = `- ${agent.name} (ID: ${agent.id})`;
              if (agent.description) {
                desc += `: ${agent.description}`;
              }
              return desc;
            })
            .join("\n")
        : "- (no agents available)";

    const systemPrompt = `You are a concise, reliable classifier for a multi-agent system.
Your job is to map a user prompt to one of a small set of interaction types and provide structured, minimal metadata.

AVAILABLE AGENTS:
${agentContext}

CHAT STYLE: ${chatStyle}
${chatInstructions ? `CUSTOM INSTRUCTIONS: ${chatInstructions}` : ""}

Return only the structured classification according to the schema. Be explicit in reasoning but short.
CLASSIFICATION GUIDELINES:
- direct_agent_call: user directly addresses agents by name/handle or asks specific agents.
- roundtable_discussion: general question, all agents should contribute.
- agent_debate: user requests differing viewpoints / debate.
- sequential_analysis: user asks for distinct perspectives in sequence.
- single_agent_task: task best handled by one agent.

KEY SIGNALS:
- @mentions, explicit names, "only", "just", "everyone", "first/then", "pros and cons", "argue", "debate" etc.
Be conservative with unspecified fields and return defaults where unsure.`;

    const result = await generateObject({
      model: google("gemini-2.5-flash-lite"),
      prompt: userPrompt,
      system: systemPrompt,
      schema: PromptClassificationSchema,
      temperature: 0.25,
    });

    // result.object should match the schema, but validate explicitly
    try {
      const parsed = PromptClassificationSchema.parse(result.object);

      // normalize optional specialInstructions to include explicit booleans/defaults
      parsed.specialInstructions = {
        skipRoundtable: parsed.specialInstructions?.skipRoundtable ?? false,
        requireConsensus: parsed.specialInstructions?.requireConsensus ?? false,
        allowDisagreement:
          parsed.specialInstructions?.allowDisagreement ?? true,
        maxAgents: parsed.specialInstructions?.maxAgents,
      };

      // normalize suggestedOrder to only include known agents
      parsed.suggestedOrder = normalizeSuggestedOrder(
        parsed.suggestedOrder || [],
        availableAgents as Array<ChatAgent & Agent>,
      );

      logger.info("Prompt classification complete", {
        interactionType: parsed.interactionType,
        targetedAgents: parsed.targetedAgents,
        confidence: parsed.confidence,
      });

      return parsed;
    } catch (parseErr) {
      // If the LLM returned an unexpected shape, log and fallback
      logger.error("Classifier returned invalid shape; falling back", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return defaultClassification();
    }
  } catch (error) {
    logger.error("Failed to classify prompt, using default", {
      error: error instanceof Error ? error.message : String(error),
    });
    return defaultClassification();
  }
}

/**
 * Apply classification results to determine which agents should respond and in what order.
 * Returns a defensive, validated set of agents, and flags for roundtable usage.
 */
export function applyClassification(
  classification: PromptClassification,
  availableAgents: Array<ChatAgent & Agent>,
): {
  agentsToRespond: Array<ChatAgent & Agent>;
  shouldUseRoundtable: boolean;
  specialHandling?: {
    type: string;
    instructions: string;
  };
} {
  logger.info("Applying classification", {
    interactionType: classification.interactionType,
    targetedAgentCount: classification.targetedAgents?.length ?? 0,
    customOrder: classification.customOrder,
  });

  if (!availableAgents || availableAgents.length === 0) {
    logger.warn("No available agents provided to applyClassification");
    return {
      agentsToRespond: [],
      shouldUseRoundtable: false,
    };
  }

  let agentsToRespond = [...availableAgents];
  let shouldUseRoundtable = true;

  // Helper to find agents from target list (name OR id)
  const resolveTargets = (targets: string[]) => {
    if (!targets || targets.length === 0) return [];
    const resolved: Array<ChatAgent & Agent> = [];
    for (const t of targets) {
      const found = availableAgents.find(
        (a) => a.id === t || a.name.toLowerCase() === t.toLowerCase(),
      );
      if (found && !resolved.includes(found)) resolved.push(found);
      else {
        logger.warn("Targeted agent not found in availableAgents", {
          target: t,
        });
      }
    }
    return resolved;
  };

  switch (classification.interactionType) {
    case "direct_agent_call": {
      const targets = resolveTargets(classification.targetedAgents);
      if (targets.length > 0) {
        agentsToRespond = targets;
      } else {
        // If user attempted to target but none matched, fall back to all agents but log
        if (
          classification.targetedAgents &&
          classification.targetedAgents.length > 0
        ) {
          logger.warn(
            "Requested targeted agents not found; falling back to all agents",
          );
        }
        agentsToRespond = [...availableAgents];
      }

      // If custom order specified, reorder
      if (
        classification.customOrder &&
        classification.suggestedOrder.length > 0
      ) {
        agentsToRespond = reorderAgents(
          agentsToRespond,
          classification.suggestedOrder,
        );
      }

      shouldUseRoundtable =
        agentsToRespond.length > 1 &&
        !classification.specialInstructions?.skipRoundtable;
      break;
    }

    case "single_agent_task": {
      // Prefer targeted agent if provided and exists
      const targets = resolveTargets(classification.targetedAgents);
      if (targets.length > 0) {
        agentsToRespond = [targets[0]];
      } else {
        // fallback: choose the agent that seems most specialized (first in list)
        agentsToRespond = [availableAgents[0]];
      }
      shouldUseRoundtable = false;
      break;
    }

    case "roundtable_discussion":
    case "agent_debate":
    case "sequential_analysis": {
      agentsToRespond = [...availableAgents];

      // apply maxAgents if present and valid
      const max = classification.specialInstructions?.maxAgents;
      if (typeof max === "number" && max > 0) {
        const validMax = Math.max(1, Math.min(max, agentsToRespond.length));
        agentsToRespond = agentsToRespond.slice(0, validMax);
      }

      shouldUseRoundtable = !classification.specialInstructions?.skipRoundtable;
      break;
    }

    default:
      logger.warn("Unknown interactionType; using all agents as fallback", {
        interactionType: classification.interactionType,
      });
      agentsToRespond = [...availableAgents];
      shouldUseRoundtable = true;
      break;
  }

  logger.info("Classification applied", {
    originalAgentCount: availableAgents.length,
    finalAgentCount: agentsToRespond.length,
    shouldUseRoundtable,
  });

  return {
    agentsToRespond,
    shouldUseRoundtable,
    specialHandling: classification.specialInstructions?.skipRoundtable
      ? {
          type: "direct_response",
          instructions: "Provide direct answers without roundtable context",
        }
      : undefined,
  };
}

/**
 * Reorder agents based on suggested order (ids or names).
 * - Keeps any agents not in suggestedOrder appended in original relative order.
 * - Suggested order entries that don't match available agents are ignored (logged earlier).
 */
function reorderAgents(
  agents: Array<ChatAgent & Agent>,
  suggestedOrder: string[],
): Array<ChatAgent & Agent> {
  if (!suggestedOrder || suggestedOrder.length === 0) return agents;
  const remaining = [...agents];
  const ordered: Array<ChatAgent & Agent> = [];

  // Add agents in suggested order by id or name (case-insensitive for names)
  for (const nameOrId of suggestedOrder) {
    const idx = remaining.findIndex(
      (agent) =>
        agent.id === nameOrId ||
        agent.name.toLowerCase() === nameOrId.toLowerCase(),
    );
    if (idx !== -1) {
      ordered.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  }

  // Append remainder, preserving original order
  return [...ordered, ...remaining];
}

/**
 * Generate enhanced system prompt for a particular agent given classification.
 * Adds clear, agent-specific instructions and notes about consensus/disagreement.
 */
export function enhanceSystemPromptWithClassification(
  basePrompt: string,
  classification: PromptClassification,
  isTargetedAgent: boolean,
  agentName: string,
): string {
  let enhanced = basePrompt?.trim() ?? "";

  // Add context based on interaction type
  switch (classification.interactionType) {
    case "direct_agent_call":
      if (isTargetedAgent) {
        enhanced += `

=== DIRECT ADDRESS ===
The user explicitly called on you (${agentName}). Provide a focused, direct response to the user's question.`;
      } else {
        enhanced += `

=== SUPPORTING ROLE ===
You were not explicitly addressed. Offer concise supporting insights only if directly relevant.`;
      }
      break;

    case "agent_debate":
      enhanced += `

=== DEBATE MODE ===
State your main position briefly and provide supporting reasoning. You may respectfully challenge other agents' claims if contradictions appear.`;
      break;

    case "sequential_analysis":
      enhanced += `

=== ANALYTICAL CHAIN ===
Provide your analysis in a way that complements prior or subsequent agents. Emphasize your unique perspective or area of expertise.`;
      break;

    case "single_agent_task":
      enhanced += `

=== SOLO RESPONSE ===
You are the sole responder. Provide a complete, self-contained answer.`;
      break;

    case "roundtable_discussion":
    default:
      enhanced += `

=== ROUNDTABLE ===
Contribute as part of a group of agents. Be concise and explicit about what part of the answer is your contribution.`;
      break;
  }

  // Special instructions
  const special = classification.specialInstructions ?? {};
  if (special.skipRoundtable) {
    enhanced += `

=== DIRECT MODE ===
Roundtable formalities should be skipped. Provide direct, focused answers.`;
  }
  if (special.requireConsensus) {
    enhanced += `

=== SEEK CONSENSUS ===
Where possible, attempt to converge on shared recommendations or agree on a prioritized list.`;
  }
  if (special.allowDisagreement) {
    enhanced += `

=== DIVERGENT THINKING ENCOURAGED ===
If you hold a reasoned alternative view, present it clearly and indicate tradeoffs.`;
  }

  // small note for targeted agent
  if (isTargetedAgent) {
    enhanced += `

Note: You were targeted by the user. Prefer clarity and completeness.`;
  }

  return enhanced;
}

/**
 * USAGE_EXAMPLE updated to show how the improved functions fit in.
 * (Kept as a string for copy/paste into process-chat.ts)
 */
export const USAGE_EXAMPLE = `
// Example integration:

const latestUserMessage = chat.messages.filter(m => m.userId).pop();
if (!latestUserMessage) throw new Error("No user message found");

const classification = await classifyUserPrompt(
  latestUserMessage.content,
  enabledAgents.map(a => ({ id: a.id, name: a.name, description: a.description })),
  chat.style,
  chat.instructions,
);

const { agentsToRespond, shouldUseRoundtable, specialHandling } =
  applyClassification(classification, enabledAgents);

for (const agent of agentsToRespond) {
  const isTargeted = classification.targetedAgents.some(t => t === agent.id || t.toLowerCase() === agent.name.toLowerCase());
  const enhancedInstructions = enhanceSystemPromptWithClassification(
    chat.instructions || "",
    classification,
    isTargeted,
    agent.name,
  );

  const result = await processAgentResponseWithStreaming(agent, messageHistory, enhancedInstructions, chat.style);
  // ...
}
`;
