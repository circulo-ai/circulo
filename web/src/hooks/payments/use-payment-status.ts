import { useSWR } from "@/lib/swr";
import type { Payment } from "./types";

export function usePaymentStatus(paymentId: string | null) {
  const shouldFetch = Boolean(paymentId);

  const { data, error, isLoading, mutate } = useSWR<Payment>(
    shouldFetch ? `/api/v1/payments/${paymentId}` : null,
  );

  return {
    payment: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}
