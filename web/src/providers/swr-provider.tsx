"use client";

import { swrConfig } from "@/lib/swr";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

export function SwrProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
