"use client";

import { Conversation } from "@/components/sidebar/telegram/types";
import { SidebarMenuAction, SidebarMenuButton } from "@/components/ui/sidebar";
import { Check, ImageIcon, X } from "lucide-react";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationItemProps {
  conversation: Conversation;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  isActive?: boolean;
}

export function ConversationItem({
  conversation,
  onClick,
  onDelete,
  isActive = false,
}: ConversationItemProps) {
  return (
    <div className="group/menu-item relative">
      <SidebarMenuButton isActive={isActive} onClick={onClick} className="h-14">
        <ConversationAvatar
          src={conversation.avatar}
          alt={conversation.name}
          fallback={conversation.name.substring(0, 2)}
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span
              className={`truncate ${conversation.unread ? "font-semibold" : "font-medium"}`}
            >
              {conversation.name}
            </span>
            {conversation.verified && (
              <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#7C3AED]" />
            )}
            {conversation.badges?.map((badge, i) => (
              <span key={i} className="text-xs">
                {badge}
              </span>
            ))}
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {conversation.hasAttachment && (
              <>
                <ImageIcon className="h-3.5 w-3.5" />
                <span className="bg-muted inline-block h-3.5 w-3.5 rounded" />
              </>
            )}
            <span className="truncate">{conversation.lastMessage}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {conversation.timestamp}
          </span>
        </div>
      </SidebarMenuButton>
      <SidebarMenuAction
        showOnHover
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(conversation.id);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </SidebarMenuAction>
    </div>
  );
}
