import type { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { telegramClient } from "better-auth-telegram/client";
import {
  apiKeyClient,
  customSessionClient,
  oneTimeTokenClient,
} from "better-auth/client/plugins";
import { nextCookies } from "better-auth/next-js";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";

export function getBaseURL() {
  return getEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

export const authClient = createAuthClient({
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL:
    typeof window !== "undefined" ? window.location.origin : getBaseURL(),
  plugins: [
    telegramClient(),
    oneTimeTokenClient(),
    nextCookies(),
    customSessionClient<typeof auth>(),
    apiKeyClient(),
  ],
  fetchOptions: {
    onError(e) {
      if (e.error.status === 429) {
        toast.error("Too many requests. Please try again later.");
      }
    },
  },
});

export const { signIn, signUp, signOut } = authClient;
