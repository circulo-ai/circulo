"use client";

import { EnhancedLink } from "@/components/enhanced-link";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarContextMenu,
  CustomSidebarGroup,
  CustomSidebarHeader,
  CustomSidebarMenuAvatar,
  CustomSidebarMenuButton,
  CustomSidebarMenuSkeleton,
} from "@/components/ui-custom/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  SidebarContent,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { formatDate } from "@/lib/format-date";
import { ChatSidebarAddAction } from "./chat-sidebar-add-action";
import { ChatSidebarBurgerMenu } from "./chat-sidebar-burger-menu";
import { ChatSidebarEmpty } from "./chat-sidebar-empty";
import { ChatSidebarNoResult } from "./chat-sidebar-no-result";
import { ChatSidebarSearch } from "./chat-sidebar-search";

export function ChatSidebarInside() {
  const {
    data,
    isLoading,
    search,
    debouncedSearch,
    setSearch,
    currentChatId,
    setCurrentChatId,
  } = useChatHistory();

  return (
    <>
      <CustomSidebarHeader>
        {/* TODO add chat tabs + sidebar separator */}
        <ChatSidebarBurgerMenu />
        <ChatSidebarSearch search={search} setSearch={setSearch} />
      </CustomSidebarHeader>
      <SidebarContent>
        <CustomSidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <SidebarMenuItem key={index}>
                    <CustomSidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}

              {data?.chats.length === 0 && debouncedSearch.length === 0 && (
                <ChatSidebarEmpty />
              )}

              {data?.chats.length === 0 && debouncedSearch.length !== 0 && (
                <ChatSidebarNoResult />
              )}

              {data?.chats.map((item: any) => (
                <SidebarMenuItem key={item.id}>
                  <CustomSidebarContextMenu>
                    <CustomSidebarMenuButton
                      isActive={currentChatId === item.id}
                      asChild
                    >
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
                            {
                              /*Boolean(item.messageCount)*/ true && (
                                <Badge
                                  className="shrink-0"
                                  variant="sidebar-menu-badge"
                                >
                                  {item.messageCount}
                                </Badge>
                              )
                            }
                          </div>
                        </div>
                      </WithRipple>
                    </CustomSidebarMenuButton>
                  </CustomSidebarContextMenu>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
          <ChatSidebarAddAction />
        </CustomSidebarGroup>
      </SidebarContent>
    </>
  );
}

// TODO add the controlled input from the Toco project
