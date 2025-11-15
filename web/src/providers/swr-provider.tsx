"use client";

import { swrConfig } from "@/lib/swr";
import { ReactNode } from "react";
import { SWRConfig } from "swr";

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        ...swrConfig,

        // Global error handler
        onError: (error, key) => {
          // Ignore errors for internal state keys (not API endpoints)
          if (
            key.includes(":should-") ||
            key === "artifact" ||
            key === "artifact-metadata-init" ||
            key.endsWith("-visibility") || // Add this
            (!key.startsWith("/") && !key.startsWith("http"))
          ) {
            return;
          }

          console.error("SWR Error:", key, error);

          // You can add error tracking here (e.g., Sentry)
          // Sentry.captureException(error);
        },

        // Global success handler (optional)
        onSuccess: (data, key) => {
          // Optional: log successful requests
          // console.log('SWR Success:', key, data);
        },

        // Override specific configs if needed
        revalidateOnReconnect: true,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        errorRetryInterval: 5000,
        dedupingInterval: 2000,
        focusThrottleInterval: 5000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
