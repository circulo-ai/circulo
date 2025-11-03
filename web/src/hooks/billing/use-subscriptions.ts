"use client";

import { useSWR } from "@/lib/swr";

export type SubscriptionSummary = {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart?: string;
  trialEnd?: string;
  canceledAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  plan?: {
    id: string;
    name: string;
    description?: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
    trialPeriodDays?: number;
    features: Record<string, any>;
  };
};

export function useSubscriptions() {
  const { data, error, isLoading, mutate } = useSWR<SubscriptionSummary[]>(
    "/api/v1/billing/subscriptions",
  );

  return {
    subscriptions: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}
