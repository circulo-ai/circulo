import { getEnv } from "@/lib/env";
import "@/polyfills/async-local-storage";
import { apiKeyClient } from "@better-auth/api-key/client";
import {
  adminClient,
  customSessionClient,
  emailOTPClient,
  magicLinkClient,
  oneTimeTokenClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { nextCookies } from "better-auth/next-js";
import { createAuthClient } from "better-auth/react";

export function getBaseURL() {
  return getEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

export const authClient = createAuthClient({
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL:
    typeof window !== "undefined" ? window.location.origin : getBaseURL(),
  plugins: [
    adminClient(),
    apiKeyClient(),
    emailOTPClient(),
    oneTimeTokenClient(),
    nextCookies(),
    customSessionClient<any>(),
    magicLinkClient(),
    organizationClient(),
    twoFactorClient(),
  ],
});

export const { useActiveOrganization } = authClient;
export const { signIn, signUp, signOut, useSession } = authClient;
