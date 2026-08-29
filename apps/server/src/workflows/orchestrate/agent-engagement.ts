import type { Agent } from "@/db";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessages } from "@/lib/utils";
import type { PromptMention } from "./types";

/** Keeps a classifier miss from suppressing an explicit request for an agent. */
export function hasExplicitAgentDirective(
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
  mentions: PromptMention[] = [],
): boolean {
  if (mentions.some((mention) => mention.kind === "agent")) return true;

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

/** Tool mentions explicitly ask the controller to act, without requiring a specialist. */
export function hasExplicitToolDirective(
  messages: ChatMessage[],
  mentions: PromptMention[] = [],
): boolean {
  if (mentions.some((mention) => mention.kind === "tool")) return true;
  const text = getTextFromMessages(messages);
  return (
    /(^|\s)@(?:tool|mcp)(?:\b|$)/i.test(text) ||
    /(^|\s)@(?:tool|mcp)(?::|[\/_-])[a-z0-9][a-z0-9_.:/-]*/i.test(text)
  );
}

/** Requests about the orchestration product itself belong to the controller. */
export function isOrchestratorOwnedRequest(messages: ChatMessage[]): boolean {
  return /\b(?:orchestrat(?:e|ion|or)|workflow(?:s)?|agentic|harness|handoff|mcp|execution loop|tool access|chat coordination)\b/i.test(
    getTextFromMessages(messages),
  );
}

/** Keep controller-owned work local unless a named specialist was requested. */
export function shouldUseControllerDirectly(params: {
  messages: ChatMessage[];
  mentions?: PromptMention[];
}): boolean {
  const mentions = params.mentions ?? [];
  if (mentions.some((mention) => mention.kind === "agent")) return false;
  if (hasExplicitToolDirective(params.messages, mentions)) return true;
  if (isOrchestratorOwnedRequest(params.messages)) return true;
  return false;
}

/** Explicit user directives take precedence over a classifier false negative. */
export function shouldEngageAgents(
  classifiedEngagement: boolean,
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
  mentions: PromptMention[] = [],
): boolean {
  return (
    classifiedEngagement ||
    hasExplicitAgentDirective(messages, agents, mentions) ||
    hasExplicitToolDirective(messages, mentions)
  );
}

/** Return agent IDs named by a targeted directive; generic @agent stays planner-selected. */
export function getExplicitlyMentionedAgentIds(
  messages: ChatMessage[],
  agents: Array<{ agent: Agent }>,
  mentions: PromptMention[] = [],
): string[] {
  const text = getTextFromMessages(messages).toLowerCase();
  const structuredIds = new Set(
    mentions
      .filter((mention) => mention.kind === "agent")
      .map((mention) => mention.key),
  );

  return agents
    .filter(({ agent }) => {
      if (
        structuredIds.has(agent.id) ||
        structuredIds.has(normalizeMentionHandle(agent.name))
      ) {
        return true;
      }
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

function normalizeMentionHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^a-z0-9-]/g, "");
}
