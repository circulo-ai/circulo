"use client"

import { SidebarHeader } from "./sidebar-header"
import { SidebarContent } from "./sidebar-content"
import { FloatingActionButton } from "./floating-action-button"
import { Conversation } from "@/components/sidebar/telegram/types";
import { useEffect, useState } from "react"

interface SidebarProps {
  conversations: Conversation[]
}

export function Sidebar({ conversations }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      const sidebar = document.querySelector("aside")
      if (sidebar) {
        const width = sidebar.offsetWidth
        setCollapsed(width < 150)
      }
    }

    checkWidth()
    const observer = new ResizeObserver(checkWidth)
    const sidebar = document.querySelector("aside")
    if (sidebar) observer.observe(sidebar)

    return () => observer.disconnect()
  }, [])

  return (
    <aside className="relative flex flex-col h-full bg-[#1A1A1A] border-r border-border/30">
      <SidebarHeader collapsed={collapsed} />
      <SidebarContent conversations={conversations} collapsed={collapsed} />
      <FloatingActionButton collapsed={collapsed} />
    </aside>
  )
}
