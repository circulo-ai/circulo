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
  SidebarRail,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { Session } from "@/lib/auth";
import { Home, Plus } from "lucide-react";

interface ChatSidebarInsideProps {
  user: Session["user"];
}

export function ChatSidebarInside({}: ChatSidebarInsideProps) {
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
                      <span>{item.title}</span>
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
      <SidebarRail />
    </>
  );
}
