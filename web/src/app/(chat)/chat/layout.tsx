import { ChatSidebar } from "@/app/(chat)/components/chat-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { PageSpinner } from "@/components/page-spinner";
import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui";
import { ReactNode, Suspense } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <RedirectToSignIn />
      <SignedIn>
        <DataStreamProvider>
          <Suspense fallback={<PageSpinner />}>
            <ChatSidebar>{children}</ChatSidebar>
          </Suspense>
        </DataStreamProvider>
      </SignedIn>
    </>
  );
}
