import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { getSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { ReactNode } from "react";

export async function ChatSidebar({ children }: { children: ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {session?.user && (
        <Sidebar>
          <SidebarHeader />
          <SidebarContent>
            <SidebarGroup />
            <SidebarGroup />
          </SidebarContent>
          <SidebarFooter />
        </Sidebar>
      )}
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
