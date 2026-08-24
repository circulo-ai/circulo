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
  useSidebar,
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
  const [view, setView] = useState<"all" | "archived">("all");
  const { open } = useSidebar();
  const {
    history: { data, isLoading },
    search,
    setSearch,
    debouncedSearch,
  } = useChatHistory({ view });

  return (
    <>
      <CustomSidebarHeader>
        {/* TODO add chat tabs + sidebar separator */}
        <ChatSidebarBurgerMenu />
        <ChatSidebarSearch search={search} setSearch={setSearch} />
      </CustomSidebarHeader>
      <SidebarContent>
        {open && (
          <div
            aria-label="Chat history views"
            className="sticky top-0 z-10 flex shrink-0 border-b border-sidebar-border/70 bg-sidebar/95 px-3 pt-1 backdrop-blur-sm"
            role="tablist"
          >
            {(
              [
                ["all", "All chats"],
                ["archived", "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-selected={view === value}
                className="relative min-h-9 flex-1 px-2 text-xs font-medium text-sidebar-foreground/60 transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-teal-400 after:opacity-0 after:transition-opacity hover:text-sidebar-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-teal-400/70 focus-visible:outline-none focus-visible:ring-inset data-[active=true]:text-sidebar-foreground data-[active=true]:after:opacity-100"
                data-active={view === value}
                key={value}
                onClick={() => setView(value)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <CustomSidebarGroup>
          <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto pb-2">
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
                  debouncedSearch.length === 0 && (
                    <ChatSidebarEmpty archived={view === "archived"} />
                  )}

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
