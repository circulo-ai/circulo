"use client";

import { CustomSidebarInset } from "@/components/ui-custom/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useSidebar } from "@/components/ui/sidebar";
import React from "react";
import { ChatSidebarResizablePanel } from "./chat-sidebar-resizable-panel";

interface ChatSidebarLayoutProps {
  sidebarId: string;
  contentId: string;
  handleId: string;
  snapshot: any;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function ChatSidebarLayout({
  sidebarId,
  contentId,
  handleId,
  snapshot,
  sidebar,
  children,
}: ChatSidebarLayoutProps) {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        {sidebar}
        <CustomSidebarInset className="flex-1 overflow-hidden">
          {children}
        </CustomSidebarInset>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      id="resizable-panel-group-id"
      autosaveId="chat-sidebar"
      autosaveStrategy="cookie"
      orientation="horizontal"
      snapshot={snapshot}
    >
      <ChatSidebarResizablePanel id={sidebarId}>
        {sidebar}
      </ChatSidebarResizablePanel>
      <ResizableHandle
        size="8px"
        id={handleId}
        className="bg-sidebar transition-colors hover:bg-teal-900"
      />
      <ResizablePanel id={contentId}>
        <CustomSidebarInset>{children}</CustomSidebarInset>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
