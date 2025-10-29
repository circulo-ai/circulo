"use client";

import { TriggerAuthContext } from "@trigger.dev/react-hooks";
import { env } from "@/lib/env";
import type { ReactNode } from "react";
import { useContext, useEffect, useState } from "react";
import { useSession } from "@/providers/session-provider";

// Create our own useTriggerAuth hook
export function useTriggerAuth() {
  const context = useContext(TriggerAuthContext);
  if (!context) {
    throw new Error("useTriggerAuth must be used within a TriggerProvider");
  }
  return context;
}

export function TriggerProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Use self-hosted Trigger.dev API URL if provided; otherwise fall back to hosted default
  const baseURL = env.NEXT_PUBLIC_TRIGGER_API_URL || "https://api.trigger.dev";

  useEffect(() => {
    async function fetchAccessToken() {
      // Wait for session to be determined
      if (sessionPending) {
        return;
      }

      // If no user session, set accessToken to undefined and stop loading
      if (!session?.user) {
        setAccessToken(undefined);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/trigger/token");
        if (response.ok) {
          const data = await response.json();
          setAccessToken(data.accessToken);
        } else {
          console.error("Failed to fetch Trigger.dev access token:", response.statusText);
          setAccessToken(undefined);
        }
      } catch (error) {
        console.error("Error fetching Trigger.dev access token:", error);
        setAccessToken(undefined);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAccessToken();
  }, [session?.user, sessionPending]);

  // Don't render children until we've attempted to fetch the token or determined no session
  if (isLoading) {
    return null;
  }

  return (
    <TriggerAuthContext.Provider value={{ baseURL, accessToken }}>
      {children}
    </TriggerAuthContext.Provider>
  );
}