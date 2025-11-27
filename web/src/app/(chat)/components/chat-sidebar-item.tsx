import { EnhancedLink } from "@/components/enhanced-link";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarContextMenu,
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
} from "@/components/ui-custom/sidebar";
import { Badge } from "@/components/ui/badge";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { formatDate } from "@/lib/format-date";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { Pin } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { Key } from "swr";
import useSWRMutation from "swr/mutation";
import { GetChatHistoryResponse } from "../../api/history/route";

type ChatListItem = GetChatHistoryResponse["chats"][0] & { messageCount?: number };

interface ChatSidebarItemProps {
  item: ChatListItem;
  currentChatId: string | undefined;
  setCurrentChatId: Dispatch<SetStateAction<string | undefined>>;
}

export function ChatSidebarItem({
  item,
  currentChatId,
  setCurrentChatId,
}: ChatSidebarItemProps) {
  const { trigger } = useSWRMutation<unknown, unknown, Key, {}>(
    `/api/chat/${item.id}/pin`,
    getFetcher("POST"),
  );

  return (
    <SidebarMenuItem>
      <CustomSidebarContextMenu onPin={() => trigger({}, {})}>
        <CustomSidebarMenuButton isActive={currentChatId === item.id} asChild>
          <WithRipple
            component={EnhancedLink}
            componentProps={{
              enableLinkStatus: false,
              asButton: false,
              href: `/chat/${item.id}`,
              onClick: () => setCurrentChatId(item.id),
            }}
          >
            <CustomSidebarMenuAvatar />
            <div className="flex max-h-9 w-full flex-col justify-center">
              <div className="flex items-center gap-2">
                <div className="line-clamp-1 grow font-medium">
                  {item.title}
                </div>
                <div className="shrink-0 text-xs opacity-75">
                  {formatDate(new Date(item.updatedAt))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="line-clamp-1 grow opacity-75">
                  {item.description}
                </div>
                <div className="relative flex h-4.5 min-w-10 shrink-0 items-end justify-end">
                  <Pin
                    className={cn(
                      "size-4 opacity-0 transition-opacity",
                      /*item.isPinned*/ true && "opacity-75",
                    )}
                  />
                  <Badge
                    variant="sidebar-menu-badge"
                    className={cn(
                      "absolute opacity-0",
                      /*Boolean(item.messageCount)*/ false && "opacity-100",
                    )}
                  >
                    {item.messageCount}
                  </Badge>
                </div>
              </div>
            </div>
          </WithRipple>
        </CustomSidebarMenuButton>
      </CustomSidebarContextMenu>
    </SidebarMenuItem>
  );
}
