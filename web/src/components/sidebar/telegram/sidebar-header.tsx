"use client"

import { SearchBar } from "./search-bar"
import { TabButton } from "./tab-button"

interface SidebarHeaderProps {
  collapsed: boolean
  onNewChat?: () => void
  onDeleteAll?: () => void
}

export function SidebarHeader({ collapsed, onNewChat, onDeleteAll }: SidebarHeaderProps) {
  if (collapsed) {
    return <div className="flex items-center justify-center px-2 py-2 border-b border-border/50 sticky top-0 z-10 bg-[#1A1A1A]"></div>
  }

  return (
    <div className="border-b border-border/50 sticky top-0 z-10 bg-[#1A1A1A]">
      <SearchBar onNewChat={onNewChat} onDeleteAll={onDeleteAll} />
      <div className="flex items-center gap-2 px-2 pt-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabButton label="All" count={100} active />
        <TabButton label="Channels" count={263} />
        <TabButton label="Unread" />
      </div>
    </div>
  )
}
