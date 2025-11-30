import { GetChatHistoryResponse } from "@/app/api/history/route";
import { EnhancedLink } from "@/components/enhanced-link";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarContextMenu,
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
} from "@/components/ui-custom/sidebar";
import { Badge } from "@/components/ui/badge";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { useOptimisticSWRMutation } from "@/hooks/use-optimistic-swr-mutation";
import { formatDate } from "@/lib/format-date";
import { getFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useChatHistoryStore } from "@/stores/use-chat-history-store";
import { Pin } from "lucide-react";
import { useCallback } from "react";
import { Arguments, Key } from "swr";

interface ChatSidebarItemProps {
  item: GetChatHistoryResponse["chats"][0];
}

export function ChatSidebarItem({ item }: ChatSidebarItemProps) {
  const { currentChatId, setCurrentChatId } = useChatHistoryStore();

  const isHistoryKey = useCallback(
    (key?: Arguments) =>
      (Array.isArray(key) && key[0] === "/api/history") ||
      (typeof key === "string" && key.startsWith("/api/history")),
    [],
  );

  const { trigger: handlePinChange } = useOptimisticSWRMutation<
    GetChatHistoryResponse,
    boolean,
    unknown,
    unknown,
    Key,
    {}
  >({
    mutationKey: `/api/chat/${item.id}/pin`,
    mutationFetcher: getFetcher("POST"),
    matchMutateKey: isHistoryKey,
    mapOptimisticToMutationArg: () => ({}),
    deriveOptimisticData: (current, nextIsPinned) => {
      if (!current) return current;

      const target = current.chats.find((chat) => chat.id === item.id);
      if (!target || target.isPinned === nextIsPinned) return current;

      return {
        ...current,
        chats: current.chats.map((chat) =>
          chat.id === item.id
            ? {
                ...chat,
                isPinned: nextIsPinned,
                pinOrder: nextIsPinned ? (chat.pinOrder ?? 0) : undefined,
              }
            : chat,
        ),
      };
    },
  });

  return (
    <SidebarMenuItem>
      <CustomSidebarContextMenu
        isPinned={item.isPinned}
        onPinChange={handlePinChange}
      >
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
                      item.isPinned && "opacity-75",
                    )}
                  />
                  <Badge
                    variant="sidebar-menu-badge"
                    className={cn(
                      "absolute opacity-0",
                      Boolean(0) && "opacity-100",
                    )}
                  >
                    12
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
