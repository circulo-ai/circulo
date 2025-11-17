import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cookies } from "next/headers";
import { ReactNode } from "react";
import { ChatSidebarInside } from "./chat-sidebar-inside";
import { ChatSidebarResizablePanel } from "./chat-sidebar-resizable-panel";

export async function ChatSidebar({ children }: { children: ReactNode }) {
  const resizablePanelGroupId = "resizable-panel-group-id";
  const firstResizablePanelId = "first-resizable-panel-id";
  const secondResizablePanelId = "second-resizable-panel-id";
  const resizableHandleId = "resizable-handle-id";

  const cookieStore = await cookies();

  const chatSidebarCookie = cookieStore.get("chat-sidebar");
  const snapshot = chatSidebarCookie
    ? JSON.parse(chatSidebarCookie.value)
    : undefined;

  const defaultClose = cookieStore.get("sidebar_state")?.value === "false";

  return (
    <SidebarProvider defaultOpen={!defaultClose}>
      <ResizablePanelGroup
        id={resizablePanelGroupId}
        autosaveId="chat-sidebar"
        autosaveStrategy="cookie"
        orientation="horizontal"
        snapshot={snapshot}
      >
        <ChatSidebarResizablePanel
          id={firstResizablePanelId}
          min="256px"
          default="256px"
          max="384px"
          // isStaticAtRest // TODO can't use but it's a good prop, could make a or to the library's repo to fix it
          collapsible
          collapsedSize="64px"
          collapseAnimation={{
            duration: 150,
            easing: "ease-in-out",
          }}
        >
          <Sidebar className="static w-full" collapsible="icon" variant="inset">
            <ChatSidebarInside />
          </Sidebar>
        </ChatSidebarResizablePanel>
        <ResizableHandle
          size="12px"
          id={resizableHandleId}
          className="bg-background"
        />
        <ResizablePanel id={secondResizablePanelId}>
          <SidebarInset>{children}</SidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
