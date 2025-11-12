"use client"

import { ConversationAvatar } from "./conversation-avatar"
import { Conversation } from "@/components/sidebar/telegram/types";
import { SidebarMenuButton } from "@/components/ui/sidebar"

interface CollapsedConversationItemProps {
  conversation: Conversation
  onClick?: () => void
}

export function CollapsedConversationItem({ conversation, onClick }: CollapsedConversationItemProps) {
  return (
    <SidebarMenuButton onClick={onClick} size="lg" className="justify-center">
      <ConversationAvatar
        src={conversation.avatar}
        alt={conversation.name}
        fallback={conversation.name.substring(0, 2)}
        className="h-11 w-11"
      />
    </SidebarMenuButton>
  )
}
