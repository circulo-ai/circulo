import {
  CustomSidebar,
  CustomSidebarInset,
} from "@/components/ui-custom/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarProvider } from "@/components/ui/sidebar";
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
          default="320px"
          max="384px"
          // isStaticAtRest // TODO can't use but it's a good prop, could make a pr to the library's repo to fix it
          collapsible
          collapsedSize="60px"
          collapseAnimation={{
            duration: 150,
            easing: "ease-in-out",
          }}
        >
          <CustomSidebar>
            <ChatSidebarInside />
          </CustomSidebar>
        </ChatSidebarResizablePanel>
        <ResizableHandle
          size="8px"
          id={resizableHandleId}
          className="bg-sidebar transition-colors hover:bg-teal-900"
        />
        <ResizablePanel id={secondResizablePanelId}>
          <CustomSidebarInset>{children}</CustomSidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}

// TODO fix the bg-chat when the svg has not loaded yet
// TODO the suspense state flickers
// TODO the first page spinner shows up late
// TODO use scroll area component in sidebar for chats
// TODO use animated list in sidebar for chats
