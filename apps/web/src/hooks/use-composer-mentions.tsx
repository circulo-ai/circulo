"use client";

import type { MentionItemType } from "@/components/ai-elements/prompt-input";
import { getAttachmentPreviewUrl } from "@/lib/attachment-preview";
import {
  filterMentionChoices,
  resolvePromptMentions,
} from "@/lib/mention-picker";
import type { Attachment } from "@/lib/types";
import { Bot, FileText, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

type CatalogAgent = {
  id: string;
  agentId?: string;
  name: string;
  description?: string | null;
  isEnabled?: boolean;
  agent?: CatalogAgent;
};
type Capability = {
  name: string;
  description?: string;
  status?: string;
  tools?: string[];
  enabled?: boolean;
};
type Resource = {
  id: string;
  name: string;
  url: string | null;
  mediaType: string | null;
  size: number | null;
  type: string;
  sender?: { name: string };
};

function handle(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, "-")
      .replace(/[^\p{L}\p{N}_.-]/gu, "") || "item"
  );
}
function suffix(value: string) {
  let hash = 0;
  for (const char of value)
    hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}
async function readCatalog<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Mentions could not be loaded. Try again.");
  return response.json();
}

export function useComposerMentions({
  chatId,
  attachments,
  revision,
}: {
  chatId?: string;
  attachments: Attachment[];
  revision?: number;
}) {
  const catalogPromise = useRef<Promise<MentionItemType[]> | null>(null);
  const catalogRef = useRef<MentionItemType[]>([]);
  const scopeRef = useRef(chatId);
  const revisionRef = useRef(revision);
  useEffect(() => {
    if (scopeRef.current === chatId && revisionRef.current === revision) return;
    if (scopeRef.current !== chatId) catalogRef.current = [];
    scopeRef.current = chatId;
    revisionRef.current = revision;
    catalogPromise.current = null;
  }, [chatId, revision]);

  const fetchMentions = useCallback(
    async (query: string) => {
      if (!catalogPromise.current) {
        catalogPromise.current = Promise.all([
          readCatalog<CatalogAgent[] | { agents: CatalogAgent[] }>(
            chatId ? `/api/chat/${chatId}/agent` : "/api/agent?limit=100",
          ),
          readCatalog<{ plugins: Capability[]; apps: Capability[] }>(
            "/api/capabilities",
          ),
          chatId
            ? readCatalog<{ resources: Resource[] }>(
                `/api/chat/${chatId}/resources`,
              )
            : Promise.resolve({ resources: [] as Resource[] }),
        ])
          .then(([agentData, capabilities, files]) => {
            const agents = Array.isArray(agentData)
              ? agentData
              : agentData.agents;
            const result: MentionItemType[] = agents
              .filter((item) => item.isEnabled !== false)
              .map((item) => {
                const agent = item.agent ?? item;
                return {
                  type: "mention",
                  kind: "agent",
                  name: agent.name,
                  username: agent.id,
                  insertText: handle(agent.name),
                  description:
                    agent.description ??
                    (chatId ? "Enabled in this chat" : "Workspace agent"),
                  icon: <Bot aria-hidden="true" />,
                };
              });
            const toolNames = new Set<string>();
            for (const capability of [
              ...capabilities.plugins,
              ...capabilities.apps,
            ]) {
              if (
                capability.enabled === false ||
                ["draft", "disabled", "error", "disconnected"].includes(
                  capability.status ?? "",
                )
              )
                continue;
              for (const tool of capability.tools ?? []) {
                if (toolNames.has(tool)) continue;
                toolNames.add(tool);
                result.push({
                  type: "mention",
                  kind: "tool",
                  name: tool
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/[_-]/g, " ")
                    .replace(/^./, (letter) => letter.toUpperCase()),
                  username: `tool:${tool}`,
                  insertText: `tool:${tool}`,
                  description: capability.name,
                  icon: <Wrench aria-hidden="true" />,
                });
              }
            }
            for (const file of files.resources) {
              if (
                file.type === "artifact" ||
                !getAttachmentPreviewUrl(file.url)
              )
                continue;
              result.push({
                type: "mention",
                kind: "file",
                name: file.name,
                username: `file:${file.id}`,
                insertText: `file:${handle(file.name)}`,
                description: `Shared in this chat${file.sender ? ` · ${file.sender.name}` : ""}`,
                icon: <FileText aria-hidden="true" />,
                attachment: {
                  url: file.url!,
                  name: file.name,
                  contentType: file.mediaType ?? "application/octet-stream",
                  size: file.size ?? undefined,
                },
              });
            }
            return result;
          })
          .catch((error) => {
            catalogPromise.current = null;
            throw error;
          });
      }
      let base = await catalogPromise.current;
      const agentSearch = query.replace(/^agents?(?::|\/)/i, "").trim();
      if (
        !chatId &&
        agentSearch &&
        !/^(tools?|mcp|files?|attachments?)(?::|\/|$)/i.test(query)
      ) {
        const matches = await readCatalog<CatalogAgent[]>(
          `/api/agent?limit=100&search=${encodeURIComponent(agentSearch)}`,
        );
        const known = new Set(
          base
            .filter((item) => item.kind === "agent")
            .map((item) => item.username),
        );
        base = [
          ...base,
          ...matches
            .filter((agent) => !known.has(agent.id))
            .map((agent) => ({
              type: "mention" as const,
              kind: "agent" as const,
              name: agent.name,
              username: agent.id,
              insertText: handle(agent.name),
              description: agent.description ?? "Workspace agent",
              icon: <Bot aria-hidden="true" />,
            })),
        ];
      }
      if (scopeRef.current !== chatId) return [];
      const drafts: MentionItemType[] = attachments.map((file) => ({
        type: "mention",
        kind: "file",
        name: file.name,
        username: `file:draft-${suffix(file.url)}`,
        insertText: `file:${handle(file.name)}`,
        description: "Attached to this message",
        icon: <FileText aria-hidden="true" />,
        attachment: file,
      }));
      const urls = new Set(drafts.map((item) => item.attachment?.url));
      const combined = [
        ...base.filter((item) => item.kind !== "file"),
        ...drafts,
        ...base.filter(
          (item) => item.kind === "file" && !urls.has(item.attachment?.url),
        ),
      ];
      const counts = new Map<string, number>();
      for (const item of combined)
        counts.set(item.insertText!, (counts.get(item.insertText!) ?? 0) + 1);
      const catalog = combined.map((item) => ({
        ...item,
        insertText:
          (counts.get(item.insertText!) ?? 0) > 1
            ? `${item.insertText}-${suffix(item.username)}`
            : item.insertText,
      }));
      catalogRef.current = [
        ...catalogRef.current.filter(
          (previous) =>
            !catalog.some(
              (item) =>
                item.username === previous.username &&
                item.insertText === previous.insertText,
            ),
        ),
        ...catalog,
      ];
      const filtered = filterMentionChoices(catalog, query);
      return (["agent", "tool", "file"] as const).flatMap((kind) =>
        filtered.filter((item) => item.kind === kind).slice(0, 20),
      );
    },
    [chatId, attachments],
  );

  const getMentions = useCallback(
    (text: string) => resolvePromptMentions(text, catalogRef.current),
    [],
  );
  return { fetchMentions, getMentions };
}
