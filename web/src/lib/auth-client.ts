import type { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import {
  apiKeyClient,
  customSessionClient,
  magicLinkClient,
  oneTimeTokenClient, organizationClient
} from "better-auth/client/plugins";
import { nextCookies } from "better-auth/next-js";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";
import { stripeClient } from '@better-auth/stripe/client'
import { isBillingEnabled } from "@/lib/environment";

export function getBaseURL() {
  return getEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

export const authClient = createAuthClient({
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL:
    typeof window !== "undefined" ? window.location.origin : getBaseURL(),
  plugins: [
    oneTimeTokenClient(),
    nextCookies(),
    customSessionClient<typeof auth>(),
    ...(isBillingEnabled
      ? [
        stripeClient({
          subscription: true, // Enable subscription management
        }),
      ]
      : []),
    apiKeyClient(),
    magicLinkClient(),
    organizationClient(),
  ],
  fetchOptions: {
    onError(e) {
      if (e.error.status === 429) {
        toast.error("Too many requests. Please try again later.");
      }
    },
  },
});


export const { useActiveOrganization } = authClient

export const useSubscription = () => {
  return {
    list: authClient.subscription?.list,
    upgrade: authClient.subscription?.upgrade,
    cancel: authClient.subscription?.cancel,
    restore: authClient.subscription?.restore,
  }
}

export const { signIn, signUp, signOut } = authClient;
