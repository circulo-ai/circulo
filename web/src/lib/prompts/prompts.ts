/**
 * Enhanced system prompt generation for better roundtable AI agent experiences
 */
import { Agent, Message, MessageWithAgent } from "@/db/schema";
import { PromptClassification } from "@/lib/prompts/classifier";

interface ChatStyle {
  style: "brainstorm" | "debate" | "analyze" | "custom";
  instructions?: string;
}

interface ModelMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Validates input parameters for message history building
 */
function validateMessageHistoryInput(
  messages: MessageWithAgent[],
  maxMessages: number,
): void {
  if (!Array.isArray(messages)) {
    throw new Error("Messages must be an array");
  }
  if (typeof maxMessages !== "number" || maxMessages < 1) {
    throw new Error("maxMessages must be a positive number");
  }
}

/**
 * Validates input parameters for system prompt building
 */
function validateSystemPromptInput(
  agent: Agent,
  chatStyle: ChatStyle,
): void {
  if (!agent || typeof agent !== "object") {
    throw new Error("Agent must be a valid object");
  }
  if (!agent.id || typeof agent.id !== "string") {
    throw new Error("Agent must have a valid id");
  }
  if (!agent.name || typeof agent.name !== "string") {
    throw new Error("Agent must have a valid name");
  }
  if (!chatStyle || typeof chatStyle !== "object") {
    throw new Error("ChatStyle must be a valid object");
  }
  if (!chatStyle.style || !["brainstorm", "debate", "analyze", "custom"].includes(chatStyle.style)) {
    throw new Error("ChatStyle must have a valid style");
  }
}

/**
 * Style-specific configurations for different roundtable modes
 */
const STYLE_CONFIGS = {
  brainstorm: {
    title: "Collaborative Brainstorming Session",
    objective:
      "Generate creative ideas and explore possibilities without judgment. Build upon each other's suggestions to create innovative solutions.",
    guidelines: [
      "Encourage wild and creative ideas - quantity over quality initially",
      "Build upon and remix previous agents' suggestions",
      "Defer judgment and criticism - focus on possibilities",
      "Combine and improve ideas from multiple perspectives",
      "Think divergently before converging on solutions",
    ],
    tone: "enthusiastic, creative, and open-minded",
  },
  debate: {
    title: "Structured Debate Forum",
    objective:
      "Critically examine different viewpoints and arguments. Challenge assumptions respectfully while building a comprehensive understanding of the topic.",
    guidelines: [
      "Present clear arguments with supporting evidence",
      "Respectfully challenge previous agents' positions when you disagree",
      "Acknowledge valid points from other perspectives",
      "Identify logical fallacies or weak arguments constructively",
      "Synthesize opposing views to find common ground or new insights",
    ],
    tone: "analytical, respectful, and intellectually rigorous",
  },
  analyze: {
    title: "Analytical Deep Dive",
    objective:
      "Systematically break down complex topics into components. Each agent examines different dimensions to build comprehensive understanding.",
    guidelines: [
      "Focus on your unique analytical angle or expertise area",
      "Reference specific findings from previous agents",
      "Identify patterns, relationships, and implications",
      "Provide evidence-based insights with clear reasoning",
      "Connect your analysis to the broader picture",
    ],
    tone: "systematic, thorough, and evidence-based",
  },
  custom: {
    title: "Custom Collaborative Session",
    objective:
      "Work together according to the specific instructions provided for this conversation.",
    guidelines: [
      "Follow the custom instructions provided for this chat",
      "Adapt your contribution style to the session's goals",
      "Build upon previous contributions constructively",
      "Maintain focus on the specific objectives outlined",
    ],
    tone: "flexible and goal-oriented",
  },
};

/**
 * Build enhanced message history with better context preservation
 */
export function buildMessageHistory(
  messages: MessageWithAgent[],
  maxMessages: number = 20,
): ModelMessage[] {
  try {
    validateMessageHistoryInput(messages, maxMessages);
    
    const validMessages = messages.filter(
      (msg) => msg.content && msg.content.trim(),
    );

    // Take the most recent messages
    const recentMessages = validMessages.slice(-maxMessages);

    return recentMessages.map((msg) => {
      let content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);

      // Format assistant messages with agent attribution
      if (!msg.userId && msg.agentId) {
        // Get agent name from message or use fallback
        const agentName = msg.agent?.name || "Agent";

        // Only add attribution if not already present
        if (!content.match(/^\[.+?\]:/)) {
          content = `[${agentName}]: ${content}`;
        }
      }

      return {
        role: msg.userId ? ("user" as const) : ("assistant" as const),
        content: content.trim(),
      };
    });
  } catch (error) {
    console.error("Error building message history:", error);
    throw new Error(`Failed to build message history: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract conversation context from message history
 */
function getConversationContext(messageHistory: ModelMessage[]) {
  try {
    if (!Array.isArray(messageHistory)) {
      throw new Error("Message history must be an array");
    }

    const userMessages = messageHistory.filter((m) => m.role === "user");
    const agentMessages = messageHistory.filter((m) => m.role === "assistant");

    // Extract unique agent names from messages
    const agentNames = new Set<string>();
    agentMessages.forEach((msg) => {
      const match = msg.content.match(/^\[(.+?)\]:/);
      if (match) {
        agentNames.add(match[1]);
      }
    });

    return {
      userMessageCount: userMessages.length,
      agentResponseCount: agentMessages.length,
      previousAgents: Array.from(agentNames),
      hasContext: messageHistory.length > 0,
      latestUserMessage: userMessages[userMessages.length - 1]?.content,
    };
  } catch (error) {
    console.error("Error extracting conversation context:", error);
    return {
      userMessageCount: 0,
      agentResponseCount: 0,
      previousAgents: [],
      hasContext: false,
      latestUserMessage: undefined,
    };
  }
}

/**
 * Build enhanced system prompt for roundtable agent
 */
export function buildSystemPrompt(
  agent: Agent,
  chatStyle: ChatStyle,
  messageHistory: ModelMessage[] = [],
  classification?: PromptClassification,
): string {
  try {
    validateSystemPromptInput(agent, chatStyle);
    
    const styleConfig = STYLE_CONFIGS[chatStyle.style];
    const context = getConversationContext(messageHistory);

    let prompt = "";

    // === IDENTITY & ROLE ===
    prompt += "=== YOUR IDENTITY ===\n";
    prompt += `You are ${agent.name}`;
    if (agent.description) prompt += ` - ${agent.description}`;
    prompt += ".\n\n";

    if (agent.systemPrompt?.trim()) prompt += `${agent.systemPrompt.trim()}\n\n`;

    // === CLASSIFICATION INTEGRATION ===
    if (classification) {
      prompt += "=== INTERACTION CONTEXT ===\n";
      prompt += `Interaction type: ${classification.interactionType}\n`;
      if (classification.reasoning)
        prompt += `Classifier reasoning: ${classification.reasoning}\n`;
      if (classification.specialInstructions?.skipRoundtable)
        prompt += "Note: Skip roundtable, provide a direct response.\n";
      if (classification.specialInstructions?.requireConsensus)
        prompt += "Note: Seek agreement with other agents where possible.\n";
      if (classification.specialInstructions?.allowDisagreement)
        prompt += "Note: Diverse perspectives are welcome.\n";
      prompt += "\n";
    }

    // === ROUNDTABLE CONTEXT ===
    prompt += "=== ROUNDTABLE CONTEXT ===\n";
    prompt += `Session Type: ${styleConfig.title}\n`;
    prompt += `Objective: ${styleConfig.objective}\n\n`;

    // === CONVERSATION STATE ===
    if (context.hasContext) {
      prompt += "=== CONVERSATION STATE ===\n";

      if (context.previousAgents.length > 0) {
        prompt += `Agents who have already contributed: ${context.previousAgents.join(", ")}\n`;
        prompt += `Total responses so far: ${context.agentResponseCount}\n`;
      }

      if (context.latestUserMessage) {
        const preview = context.latestUserMessage.slice(0, 100);
        prompt += `Current topic: "${preview}${context.latestUserMessage.length > 100 ? "..." : ""}"\n`;
      }

      prompt += "\n";
    }

    // === CHAT-SPECIFIC INSTRUCTIONS ===
    if (chatStyle.instructions && chatStyle.instructions.trim()) {
      prompt += "=== CUSTOM INSTRUCTIONS ===\n";
      prompt += `${chatStyle.instructions}\n\n`;
    }

    // === BEHAVIORAL GUIDELINES ===
    prompt += "=== YOUR CONTRIBUTION GUIDELINES ===\n";
    styleConfig.guidelines.forEach((guideline, index) => {
      prompt += `${index + 1}. ${guideline}\n`;
    });
    prompt += "\n";

    // === INTERACTION RULES ===
    prompt += "=== INTERACTION RULES ===\n";

    if (context.previousAgents.length > 0) {
      prompt += `• Review what ${context.previousAgents.join(", ")} have already said\n`;
      prompt +=
        "• Reference specific points from previous agents when building on their ideas\n";
    }

    prompt += "• Avoid repeating information already thoroughly covered\n";
    prompt += "• Focus on your unique perspective and expertise\n";
    prompt += "• Keep responses focused and valuable - quality over quantity\n";

    if (chatStyle.style === "debate") {
      prompt +=
        "• When disagreeing, explain your reasoning clearly and respectfully\n";
      prompt +=
        "• Acknowledge strong points made by others even when disagreeing\n";
    } else if (chatStyle.style === "brainstorm") {
      prompt += "• Embrace creative and unconventional ideas\n";
      prompt += "• Combine elements from multiple previous suggestions\n";
    } else if (chatStyle.style === "analyze") {
      prompt += "• Support claims with specific evidence or reasoning\n";
      prompt += "• Identify gaps in previous analyses that you can fill\n";
    }

    prompt += "\n";

    // === RESPONSE STYLE ===
    prompt += "=== RESPONSE STYLE ===\n";
    prompt += `Maintain a ${styleConfig.tone} tone throughout your contributions.\n`;

    // Model-specific optimizations
    if (agent.model.includes("claude")) {
      prompt +=
        "Provide nuanced analysis with careful reasoning. Be thorough but concise.\n";
    } else if (agent.model.includes("gpt")) {
      prompt +=
        "Be clear, structured, and direct. Maximize value in every response.\n";
    } else if (agent.model.includes("gemini")) {
      prompt +=
        "Offer creative insights and comprehensive perspectives. Think broadly.\n";
    } else if (agent.model.includes("deepseek")) {
      prompt +=
        "Focus on logical reasoning and technical depth. Be precise and analytical.\n";
    }

    // === RESPONSE FORMAT ===
    prompt += "\n=== RESPONSE FORMAT ===\n";

    if (chatStyle.style === "debate") {
      prompt +=
        "Structure: [Position/Argument] → [Supporting Evidence] → [Addressing Counter-points] → [Conclusion]\n";
    } else if (chatStyle.style === "analyze") {
      prompt +=
        "Structure: [Key Finding/Insight] → [Analysis] → [Evidence/Examples] → [Implications]\n";
    } else if (chatStyle.style === "brainstorm") {
      prompt +=
        "Structure: [New Ideas] → [Building on Previous Ideas] → [Combinations/Variations]\n";
    } else {
      prompt +=
        "Structure your response in a way that best serves the conversation's goals.\n";
    }

    prompt +=
      "\nDo not include your agent name in your response - the system handles attribution automatically.\n";

    return prompt.trim();
  } catch (error) {
    console.error("Error building system prompt:", error);
    throw new Error(`Failed to build system prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function generateAgentRosterSummary(
  agents: Agent[],
  maxAgents?: number,
): string {
  try {
    if (!Array.isArray(agents)) {
      throw new Error("Agents must be an array");
    }

    const displayAgents = maxAgents ? agents.slice(0, maxAgents) : agents;
    if (displayAgents.length === 0) return "";

    let summary = "=== ROUNDTABLE PARTICIPANTS ===\n";
    displayAgents.forEach((agent, index) => {
      if (!agent.name) {
        console.warn(`Agent at index ${index} missing name, skipping`);
        return;
      }
      summary += `${index + 1}. ${agent.name}`;
      if (agent.description) summary += ` - ${agent.description}`;
      summary += "\n";
    });

    if (maxAgents && agents.length > maxAgents) {
      summary += `\n(Note: Displaying top ${maxAgents} agents due to classification limit.)\n`;
    }

    summary +=
      "\nEach agent will contribute their unique perspective in order.\n";
    return summary;
  } catch (error) {
    console.error("Error generating agent roster summary:", error);
    return "=== ROUNDTABLE PARTICIPANTS ===\nError loading participant information.\n";
  }
}

/**
 * Create an opening context message for the first agent
 */
export function createOpeningContext(
  chatStyle: ChatStyle,
  agents: Agent[],
): string {
  try {
    if (!chatStyle || !chatStyle.style) {
      throw new Error("Invalid chat style provided");
    }
    if (!Array.isArray(agents)) {
      throw new Error("Agents must be an array");
    }

    const styleConfig = STYLE_CONFIGS[chatStyle.style];
    if (!styleConfig) {
      throw new Error(`Unknown chat style: ${chatStyle.style}`);
    }

    let context = `This is a ${styleConfig.title.toLowerCase()} with ${agents.length} AI agents.\n\n`;
    context += `Goal: ${styleConfig.objective}\n\n`;

    if (agents.length > 1) {
      context +=
        "You are the first to respond. Set a constructive tone for the discussion.\n";
    }

    return context;
  } catch (error) {
    console.error("Error creating opening context:", error);
    return "This is a collaborative session. You are the first to respond.\n";
  }
}

// //**
//  * Enhanced message history builder that can be used in process-chat.ts
//  */
// export function buildMessageHistoryWithContext(
//   messages: any[],
//   chatStyle: ChatStyle,
//   isFirstAgent: boolean = false,
// ): ModelMessage[] {
//   const messageHistory = buildMessageHistory(messages);
//
//   // Add opening context for the first agent if this is the start of a new user message
//   if (isFirstAgent && messageHistory.length > 0) {
//     const lastMessage = messageHistory[messageHistory.length - 1];
//     if (lastMessage.role === "user") {
//       // This is handled in the system prompt instead
//     }
//   }
//
//   return messageHistory;
// }
