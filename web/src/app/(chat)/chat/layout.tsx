import { ChatSidebar } from "@/app/(chat)/components/chat-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui";
import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <RedirectToSignIn />
      <SignedIn>
        <DataStreamProvider>
          <ChatSidebar>{children}</ChatSidebar>
        </DataStreamProvider>
      </SignedIn>
    </>
  );
}
