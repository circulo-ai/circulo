"use client";

import { authClient } from "@/lib/auth-client";
import { AuthUIContext } from "@daveyplate/better-auth-ui";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type User = {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  logo?: string | null | undefined;
  metadata?: any;
};

export type AppSession = {
  user: User | null;
  session?: {
    id?: string;
    userId?: string;
    activeOrganizationId?: string;
  };
} | null;

export type SessionHookResult = {
  data: AppSession;
  isPending: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export const SessionContext = createContext<SessionHookResult | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppSession>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSession = useCallback(async () => {
    try {
      setIsPending(true);
      setError(null);
      const res = await authClient.getSession();
      setData(res?.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to fetch session"));
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const value = useMemo<SessionHookResult>(
    () => ({
      data,
      isPending,
      error,
      refetch: loadSession,
    }),
    [data, isPending, error, loadSession],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useOrganizations() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error(
      "SessionProvider is not mounted. Wrap your app with <SessionProvider> in app/layout.tsx.",
    );
  }
  const {
    hooks: { useListOrganizations, useActiveOrganization },
  } = useContext(AuthUIContext);
  return {
    useListOrganizations,
    useActiveOrganization,
  };
}

export function useSession(): SessionHookResult {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error(
      "SessionProvider is not mounted. Wrap your app with <SessionProvider> in app/layout.tsx.",
    );
  }
  return ctx;
}

// TODO rewrite with swr
