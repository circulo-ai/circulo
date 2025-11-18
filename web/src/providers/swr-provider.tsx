"use client";

import { swrConfig } from "@/lib/swr";
import { ReactNode } from "react";
import { SWRConfig } from "swr";

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
