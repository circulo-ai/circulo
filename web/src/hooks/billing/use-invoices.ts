"use client";

import { useSWR } from "@/lib/swr";

export type InvoiceSummary = {
  id: string;
  number: string;
  status: string;
  subtotalAmount: number;
  subtotalCurrency: string;
  taxAmount?: number;
  taxCurrency?: string;
  totalAmount: number;
  totalCurrency: string;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  subscriptionId?: string;
};

export function useInvoices() {
  const { data, error, isLoading, mutate } = useSWR<InvoiceSummary[]>(
    "/api/v1/billing/invoices"
  );

  return {
    invoices: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}