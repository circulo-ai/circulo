"use client"

import { ConversationAvatar } from "./conversation-avatar"
import { Conversation } from "@/components/sidebar/telegram/types";

interface CollapsedConversationItemProps {
  conversation: Conversation
  onClick?: () => void
}

export function CollapsedConversationItem({ conversation, onClick }: CollapsedConversationItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center p-2 w-full hover:bg-accent/30 transition-colors"
    >
      <ConversationAvatar
        src={conversation.avatar}
        alt={conversation.name}
        fallback={conversation.name.substring(0, 2)}
        className="h-11 w-11"
      />
    </button>
  )
}
