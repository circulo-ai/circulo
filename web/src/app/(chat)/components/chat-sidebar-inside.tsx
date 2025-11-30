"use client";

import {
  CustomSidebarGroup,
  CustomSidebarHeader,
  CustomSidebarMenuSkeleton,
} from "@/components/ui-custom/sidebar";
import { AnimatedList } from "@/components/ui/animated-list";
import {
  SidebarContent,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatHistory } from "@/hooks/api/chats/use-chat-history";
import { ChatSidebarAddAction } from "./chat-sidebar-add-action";
import { ChatSidebarBurgerMenu } from "./chat-sidebar-burger-menu";
import { ChatSidebarEmpty } from "./chat-sidebar-empty";
import { ChatSidebarItem } from "./chat-sidebar-item";
import { ChatSidebarNoResult } from "./chat-sidebar-no-result";
import { ChatSidebarSearch } from "./chat-sidebar-search";

export function ChatSidebarInside() {
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

              {!isLoading && data && data.chats.length !== 0 && (
                <AnimatedList
                  ids={data.chats.map((chat) => chat.id)}
                  itemElement="div"
                  renderItem={(id) => {
                    const chat = data.chats.find((chat) => chat.id === id);
                    if (!chat) return;
                    return (
                      <ChatSidebarItem
                        key={id} // TODO do I need this here?
                        item={chat}
                      />
                    );
                  }}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
          <ChatSidebarAddAction />
        </CustomSidebarGroup>
      </SidebarContent>
    </>
  );
}

// TODO add the controlled input from the Toco project
