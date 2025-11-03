"use client";

import { useSWR } from "@/lib/swr";

export type BillingPlan = {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  trialPeriodDays?: number;
  features: Record<string, any>;
  metadata?: Record<string, any>;
  active: boolean;
};

export function usePlans() {
  const { data, error, isLoading, mutate } = useSWR<BillingPlan[]>(
    "/api/v1/billing/plans",
  );

  return {
    plans: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}
