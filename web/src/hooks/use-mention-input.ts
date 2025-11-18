"use client";

import { MentionEntity } from "@/lib/chat/mentions/types";
import { useCallback, useState } from "react";

export function useMentionInput(entities: MentionEntity[]) {
  const [selectedMentions, setSelectedMentions] = useState<MentionEntity[]>([]);

  const addMention = useCallback((mention: MentionEntity) => {
    setSelectedMentions((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === mention.id)) {
        return prev;
      }
      return [...prev, mention];
    });
  }, []);

  const removeMention = useCallback((id: string) => {
    setSelectedMentions((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMentions = useCallback(() => {
    setSelectedMentions([]);
  }, []);

  const getMentionIds = useCallback(() => {
    const agentIds = selectedMentions
      .filter((m) => m.type === "agent")
      .map((m) => m.id);
    const knowledgeBaseIds = selectedMentions
      .filter((m) => m.type === "knowledge_base")
      .map((m) => m.id);

    return { agentIds, knowledgeBaseIds };
  }, [selectedMentions]);

  return {
    selectedMentions,
    addMention,
    removeMention,
    clearMentions,
    getMentionIds,
  };
}
