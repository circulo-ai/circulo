import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSession } from "@/lib/auth";
import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui";
import { cookies } from "next/headers";

// export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <>
      <RedirectToSignIn />
      {/*<Script*/}
      {/*  src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"*/}
      {/*  strategy="beforeInteractive"*/}
      {/*/>*/}
      <SignedIn>
        <DataStreamProvider>
          <SidebarProvider defaultOpen={!isCollapsed}>
            {session?.user && <AppSidebar user={session.user} />}
            <SidebarInset>{children}</SidebarInset>
          </SidebarProvider>
        </DataStreamProvider>
      </SignedIn>
    </>
  );
}
