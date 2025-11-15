import { ConversationItem } from "./conversation-item"
import { CollapsedConversationItem } from "./collapsed-conversation-item"
import { Conversation } from "@/components/sidebar/telegram/types";

interface SidebarContentProps {
  conversations: Conversation[]
  collapsed: boolean
}

export function SidebarContent({ conversations, collapsed }: SidebarContentProps) {
  return (
    <div className="flex-1 overflow-y-auto w-full">
      {conversations.map((conversation) =>
        collapsed ? (
          <CollapsedConversationItem key={conversation.id} conversation={conversation} />
        ) : (
          <ConversationItem key={conversation.id} conversation={conversation} />
        ),
      )}
    </div>
  )
}
