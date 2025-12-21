"use client";

import { authClient } from "@/lib/auth-client";
import { getBaseUrl } from "@/lib/urls/utils";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function AuthClientProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

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
      onSessionChange={() => {
        // Clear router cache (protected routes)
        router.refresh();
      }}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}
