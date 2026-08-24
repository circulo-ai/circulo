"use client";

import { SearchBar } from "./search-bar";
import { TabButton } from "./tab-button";

interface SidebarHeaderProps {
  collapsed: boolean;
  onNewChat?: () => void;
  onDeleteAll?: () => void;
}

export function SidebarHeader({
  collapsed,
  onNewChat,
  onDeleteAll,
}: SidebarHeaderProps) {
  if (collapsed) {
    return (
      <div className="sticky top-0 z-10 flex items-center justify-center border-b border-border/50 bg-[#1A1A1A] px-2 py-2">
        <SearchBar
          onNewChat={onNewChat}
          onDeleteAll={onDeleteAll}
          hideSearhField
        />
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 border-b border-border/50 bg-[#1A1A1A]">
      <SearchBar onNewChat={onNewChat} onDeleteAll={onDeleteAll} />
      <div className="flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-2 pt-2 whitespace-nowrap [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <TabButton label="Conversations" active />
      </div>
    </div>
  );
}
