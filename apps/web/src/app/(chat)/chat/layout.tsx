import { ChatSidebar } from "@/app/(chat)/components/chat-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui";
import Script from "next/script";
import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <RedirectToSignIn />
      <SignedIn>
        <DataStreamProvider>
          <ChatSidebar>{children}</ChatSidebar>
        </DataStreamProvider>
      </SignedIn>
    </>
  );
}
