import { CustomSidebar } from "@/components/ui-custom/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cookies } from "next/headers";
import { ReactNode } from "react";
import { ChatSidebarInside } from "./chat-sidebar-inside";
import { ChatSidebarLayout } from "./chat-sidebar-layout";

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
      <ChatSidebarLayout
        sidebarId={firstResizablePanelId}
        contentId={secondResizablePanelId}
        handleId={resizableHandleId}
        snapshot={snapshot}
        sidebar={
          <CustomSidebar>
            <ChatSidebarInside />
          </CustomSidebar>
        }
      >
        {children}
      </ChatSidebarLayout>
    </SidebarProvider>
  );
}
