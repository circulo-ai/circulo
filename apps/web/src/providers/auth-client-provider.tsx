"use client";

import { authClient } from "@/lib/auth-client";
import { getBaseUrl } from "@/lib/urls/utils";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRef } from "react";

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const lastSessionIdRef = useRef<string | null | undefined>(undefined);

  return (
    <AuthUIProvider
      gravatar
      account
      persistClient
      deleteUser
      magicLink={true}
      organization={false}
      optimistic={true}
      multiSession={false}
      changeEmail={false}
      credentials={false}
      authClient={authClient}
      social={{
        providers: ["google"],
      }}
      navigate={router.push}
      replace={router.replace}
      baseURL={getBaseUrl()}
      onSessionChange={async () => {
        const session = await authClient.getSession();
        const sessionId = session?.data?.session?.id || null;
        if (lastSessionIdRef.current !== undefined && lastSessionIdRef.current !== sessionId) {
          router.refresh();
        }
        lastSessionIdRef.current = sessionId;
      }}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}
