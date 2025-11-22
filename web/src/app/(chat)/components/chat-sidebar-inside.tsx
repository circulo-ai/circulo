"use client";

import { EnhancedLink } from "@/components/enhanced-link";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarGroup,
  CustomSidebarGroupAction,
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
import { Pencil } from "lucide-react";
import { ChatSidebarBurgerMenu } from "./chat-sidebar-burger-menu";
import { ChatSidebarSearch } from "./chat-sidebar-search";

export function ChatSidebarInside() {
  const {
    data,
    isLoading,
    search,
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

              {data?.chats.map((item) => (
                <SidebarMenuItem key={item.id}>
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
                        buttonProps: { variant: "text" },
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
          <CustomSidebarGroupAction title="Add Chat">
            <Pencil /> <span className="sr-only">Add Chat</span>
          </CustomSidebarGroupAction>
        </CustomSidebarGroup>
      </SidebarContent>
    </>
  );
}

// TODO add the controlled input from the Toco project
