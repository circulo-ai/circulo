"use client";

import { EnhancedLink } from "@/components/enhanced-link";
import { EnhancedLinkSpinner } from "@/components/enhanced-link-spinner";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarMenuButton,
  CustomSidebarMenuSkeleton,
} from "@/components/ui-custom/sidebar";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { Plus } from "lucide-react";
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
      <SidebarHeader className="flex-row">
        {/* TODO add chat tabs + sidebar separator */}
        <ChatSidebarBurgerMenu />
        <ChatSidebarSearch search={search} setSearch={setSearch} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
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
                        asButton: false,
                        href: `/chat/${item.id}`,
                        buttonProps: { variant: "text" },
                        onClick: () => setCurrentChatId(item.id),
                      }}
                    >
                      <div className="size-12 rounded-full bg-foreground" />
                      <span className="truncate">{item.title}</span>
                      <SidebarMenuAction className="pointer-events-none">
                        <EnhancedLinkSpinner />
                        <span className="sr-only">Add Project</span>
                      </SidebarMenuAction>
                    </WithRipple>
                  </CustomSidebarMenuButton>
                  <SidebarMenuBadge>24</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
          <SidebarGroupAction title="Add Project">
            <Plus /> <span className="sr-only">Add Project</span>
          </SidebarGroupAction>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}

// TODO add the controlled input from the Toco project
