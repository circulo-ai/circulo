"use client"

import { SearchBar } from "./search-bar"
import { TabButton } from "./tab-button"

interface SidebarHeaderProps {
  collapsed: boolean
}

export function SidebarHeader({ collapsed }: SidebarHeaderProps) {
  if (collapsed) {
    return <div className="flex items-center justify-center p-3 border-b border-border/50"></div>
  }

  return (
    <div className="border-b border-border/50">
      <SearchBar />
      <div className="flex items-center gap-1 px-3 py-1">
        <TabButton label="All" count={100} active />
        <TabButton label="Channels" count={263} />
        <TabButton label="Unread" />
      </div>
    </div>
  )
}
