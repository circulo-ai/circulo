"use client";

import { EnhancedLink } from "@/components/enhanced-link";
import { EnhancedLinkSpinner } from "@/components/enhanced-link-spinner";
import { WithRipple } from "@/components/ui-custom/ripple";
import {
  CustomSidebarGroup,
  CustomSidebarGroupAction,
  CustomSidebarHeader,
  CustomSidebarMenuButton,
  CustomSidebarMenuSkeleton,
} from "@/components/ui-custom/sidebar";
import {
  SidebarContent,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
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
                        asButton: false,
                        href: `/chat/${item.id}`,
                        buttonProps: { variant: "text" },
                        onClick: () => setCurrentChatId(item.id),
                      }}
                    >
                      <div className="aspect-square w-12 min-w-12 overflow-hidden rounded-full bg-foreground text-background shadow-[0_0_0_0_inset] shadow-teal-600 transition-all group-data-[state=collapsed]:w-9 group-data-[state=collapsed]:min-w-9 group-data-[state=collapsed]:group-data-[active=true]/sidebar-menu-button:shadow-[0_0_0_4px_inset]">
                        <div className="flex size-full items-center justify-center bg-background/25 opacity-0 transition-opacity group-data-loading/link:opacity-100">
                          <EnhancedLinkSpinner className="size-4.5 opacity-100!" />
                        </div>
                      </div>
                      <div className="flex max-h-9 w-full flex-col justify-center">
                        <span className="truncate font-medium">
                          {item.title}
                        </span>
                        <span className="truncate opacity-75">
                          {item.description}
                        </span>
                      </div>
                    </WithRipple>
                  </CustomSidebarMenuButton>
                  <SidebarMenuBadge>24</SidebarMenuBadge>
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
