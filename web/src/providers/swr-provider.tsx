"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { swrConfig } from "@/lib/swr";

export function SwrProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}