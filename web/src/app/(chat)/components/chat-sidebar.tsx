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
import { ReactNode, useId } from "react";
import { ChatSidebarInside } from "./chat-sidebar-inside";

export async function ChatSidebar({ children }: { children: ReactNode }) {
  const resizablePanelGroupId = useId();
  const firstResizablePanelId = useId();
  const secondResizablePanelId = useId();
  const resizableHandleId = useId();

  const cookiesStore = await cookies();
  const chatSidebarCookie = cookiesStore.get("chat-sidebar");
  const snapshot = chatSidebarCookie
    ? JSON.parse(chatSidebarCookie.value)
    : undefined;

  return (
    <SidebarProvider>
      <ResizablePanelGroup
        id={resizablePanelGroupId}
        autosaveId="chat-sidebar"
        autosaveStrategy="cookie"
        orientation="horizontal"
        snapshot={snapshot}
      >
        <ResizablePanel
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
          <Sidebar className="w-full" collapsible="none" variant="inset">
            <ChatSidebarInside />
          </Sidebar>
        </ResizablePanel>
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
