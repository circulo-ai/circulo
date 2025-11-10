'use client';

import { SWRConfig } from 'swr';
import { ReactNode } from 'react';

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        // Global error handler
        onError: (error, key) => {
          console.error('SWR Error:', key, error);

          // You can add error tracking here (e.g., Sentry)
          // Sentry.captureException(error);
        },

        // Global success handler
        onSuccess: (data, key) => {
          // Optional: log successful requests
          // console.log('SWR Success:', key, data);
        },

        // Global configs
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        errorRetryInterval: 5000,
        dedupingInterval: 2000,

        // Focus throttle (ms)
        focusThrottleInterval: 5000,

        // Global fetcher (optional - we use custom fetchers in hooks)
        // fetcher: (url: string) => fetch(url).then(res => res.json()),
      }}
    >
      {children}
    </SWRConfig>
  );
}
