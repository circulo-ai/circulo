import type { Agent } from "@/db";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";

/** Keeps a classifier miss from suppressing an explicit request for an agent. */
export function hasExplicitAgentDirective(
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
): boolean {
  const text = getTextFromMessages(messages).toLowerCase();
  if (/(^|\s)@(agent|assistant|circulo|ai)(?:\b|$)/i.test(text)) {
    return true;
  }

  if (
    /\b(?:hey|hi|hello|dear)\s+(?:the\s+)?(?:agent|assistant|circulo|ai)\b/i.test(
      text,
    ) ||
    /\b(?:agent|assistant|circulo|ai)\s*[,!:]/i.test(text)
  ) {
    return true;
  }

  return agents.some(({ agent }) => {
    const name = agent.name.trim().toLowerCase();
    if (name.length < 2) return false;
    const escaped = escapeRegExp(name);
    const compact = escapeRegExp(name.replaceAll(/\s+/g, ""));
    const dashed = escapeRegExp(name.replaceAll(/\s+/g, "-"));
    return (
      new RegExp(`(^|\\s)@(?:${compact}|${dashed})(?:\\b|$)`, "i").test(text) ||
      new RegExp(
        `\\b(?:hey|hi|hello|please|can|could|would|ask|tell)\\s+(?:the\\s+)?${escaped}(?:\\b|$)`,
        "i",
      ).test(text) ||
      new RegExp(`\\b${escaped}\\s*[,!:]`, "i").test(text)
    );
  });
}

/** Explicit user directives take precedence over a classifier false negative. */
export function shouldEngageAgents(
  classifiedEngagement: boolean,
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
): boolean {
  return classifiedEngagement || hasExplicitAgentDirective(messages, agents);
}

/** Return agent IDs named by a targeted directive; generic @agent stays planner-selected. */
export function getExplicitlyMentionedAgentIds(
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
): string[] {
  const text = getTextFromMessages(messages).toLowerCase();

  return agents
    .filter(({ agent }) => {
      const name = agent.name.trim().toLowerCase();
      if (name.length < 2) return false;
      const escapedName = escapeRegExp(name);
      const compact = escapeRegExp(name.replaceAll(/\s+/g, ""));
      const dashed = escapeRegExp(name.replaceAll(/\s+/g, "-"));
      const escapedId = escapeRegExp(agent.id.toLowerCase());
      return (
        new RegExp(`@(?:${escapedId}|${compact}|${dashed})(?:\\b|$)`, "i").test(
          text,
        ) ||
        new RegExp(
          `\\b(?:hey|hi|hello|please|can|could|would|ask|tell)\\s+(?:the\\s+)?${escapedName}(?:\\b|$)`,
          "i",
        ).test(text) ||
        new RegExp(`\\b${escapedName}\\s*[,!:]`, "i").test(text)
      );
    })
    .map(({ agent }) => agent.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
