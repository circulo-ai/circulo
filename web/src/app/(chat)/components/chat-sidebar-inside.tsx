"use client";

import { EnhancedLink } from "@/components/enhanced-link";
import { EnhancedLinkSpinner } from "@/components/enhanced-link-spinner";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { Home, Plus } from "lucide-react";

export function ChatSidebarInside() {
  const { data, currentChatId, isLoading } = useChatHistory();

  return (
    <>
      <SidebarHeader>
        {/* burger menu + its dialog + search + chat tabs + sidebar separator */}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}

              {data?.chats.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={currentChatId === item.id}
                    asChild
                  >
                    <EnhancedLink
                      asButton={false}
                      href={`/chat/${item.id}`}
                      buttonProps={{ variant: "text" }}
                    >
                      <Home />
                      <span className="truncate">{item.title}</span>
                      <SidebarMenuAction className="pointer-events-none">
                        <EnhancedLinkSpinner />
                        <span className="sr-only">Add Project</span>
                      </SidebarMenuAction>
                    </EnhancedLink>
                  </SidebarMenuButton>
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
