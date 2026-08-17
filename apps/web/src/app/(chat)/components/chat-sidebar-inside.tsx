"use client";

import { SettingsModal } from "@/components/sidebar/settings-modal/settings-modal";
import {
  CustomSidebarGroup,
  CustomSidebarHeader,
  CustomSidebarMenuSkeleton,
} from "@/components/ui-custom/sidebar";
import { AnimatedItem, AnimatedList } from "@/components/ui/animated-list";
import {
  SidebarContent,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { useState } from "react";
import { ChatSidebarAddAction } from "./chat-sidebar-add-action";
import { ChatSidebarBurgerMenu } from "./chat-sidebar-burger-menu";
import { ChatSidebarEmpty } from "./chat-sidebar-empty";
import { ChatSidebarItem } from "./chat-sidebar-item";
import { ChatSidebarNoResult } from "./chat-sidebar-no-result";
import { ChatSidebarSearch } from "./chat-sidebar-search";

export function ChatSidebarInside() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    history: { data, isLoading },
    search,
    setSearch,
    debouncedSearch,
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
            <AnimatedList asChild>
              <SidebarMenu>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <SidebarMenuItem key={index}>
                      <CustomSidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))}

                {!isLoading &&
                  data &&
                  data.chats.length === 0 &&
                  debouncedSearch.length === 0 && <ChatSidebarEmpty />}

                {!isLoading &&
                  data &&
                  data.chats.length === 0 &&
                  debouncedSearch.length !== 0 && <ChatSidebarNoResult />}

                {!isLoading &&
                  data &&
                  data.chats.length !== 0 &&
                  data.chats.map((chat) => (
                    <AnimatedItem key={chat.id} asChild>
                      <ChatSidebarItem item={chat} />
                    </AnimatedItem>
                  ))}
              </SidebarMenu>
            </AnimatedList>
          </SidebarGroupContent>
          <ChatSidebarAddAction />
        </CustomSidebarGroup>
      </SidebarContent>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

// TODO add the controlled input from the Toco project
