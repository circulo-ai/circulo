"use client"

import { Check, X, ImageIcon } from "lucide-react"
import { ConversationAvatar } from "./conversation-avatar"
import { Button } from "@/components/ui/button"
import { Conversation } from "@/components/sidebar/telegram/types";

interface ConversationItemProps {
  conversation: Conversation
  onClick?: () => void
}

export function ConversationItem({ conversation, onClick }: ConversationItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 w-full hover:bg-accent/50 transition-colors group"
    >
      <ConversationAvatar
        src={conversation.avatar}
        alt={conversation.name}
        fallback={conversation.name.substring(0, 2)}
      />

      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-foreground truncate">{conversation.name}</span>
          {conversation.verified && <Check className="h-3.5 w-3.5 text-[#7C3AED] flex-shrink-0" />}
          {conversation.badges?.map((badge, i) => (
            <span key={i} className="text-xs">
              {badge}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {conversation.hasAttachment && (
            <>
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="inline-block w-3.5 h-3.5 bg-muted rounded" />
            </>
          )}
          <span className="truncate">{conversation.lastMessage}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{conversation.timestamp}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </button>
  )
}
