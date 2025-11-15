import { Conversation } from "@/components/sidebar/telegram/types";
import { CollapsedConversationItem } from "./collapsed-conversation-item";
import { ConversationItem } from "./conversation-item";

interface SidebarContentProps {
  conversations: Conversation[];
  collapsed: boolean;
}

export function SidebarContent({
  conversations,
  collapsed,
}: SidebarContentProps) {
  return (
    <div className="w-full flex-1 overflow-y-auto">
      {conversations.map((conversation) =>
        collapsed ? (
          <CollapsedConversationItem
            key={conversation.id}
            conversation={conversation}
          />
        ) : (
          <ConversationItem key={conversation.id} conversation={conversation} />
        ),
      )}
    </div>
  );
}
