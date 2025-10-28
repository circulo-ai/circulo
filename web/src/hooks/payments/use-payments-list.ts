import { useSWR } from "@/lib/swr";
import type { Payment } from "./types";

export function usePaymentList(limit = 10) {
  const { data, error, isLoading, mutate } = useSWR<Payment[]>(
    `/api/v1/payments?limit=${limit}`,
  );

  return {
    payments: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}
