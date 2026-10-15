"use client";

import { Messages } from "@/components/messages/messages";
import type { ChatMessage } from "@/lib/types";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Vote } from "@circulo-ai/db/schema";
import { memo } from "react";
import type { UIArtifact } from "./artifact";

type ArtifactMessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  artifactStatus: UIArtifact["status"];
};

export const ArtifactMessages = memo(
  ({ artifactStatus: _artifactStatus, ...props }: ArtifactMessagesProps) => (
    <Messages {...props} compact canEditMessages={false} isArtifactVisible />
  ),
);
ArtifactMessages.displayName = "ArtifactMessages";
