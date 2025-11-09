import { fetcher, globalMutate } from "@/lib/swr";
import { useState } from "react";
import type { CreatePaymentParams, Payment, PaymentResult } from "./types";

export function usePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPayment = async (
    params: CreatePaymentParams,
  ): Promise<PaymentResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetcher<PaymentResult>(
        "/api/v1/billing/deposits/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        },
      );

      // Optimistically update payment list cache
      await globalMutate(
        (key: string) => key.startsWith("/api/v1/billing/payments"),
        (existing?: Payment[]) => (existing ? [...existing] : undefined),
        false,
      );

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const redirectToGateway = (gatewayUrl: string) => {
    window.location.href = gatewayUrl;
  };

  const verifyPayment = async (token: string): Promise<Payment | null> => {
    setLoading(true);
    setError(null);

    try {
      const verified = await fetcher<Payment>(
        "/api/v1/billing/payments/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );

      // Optimistically update both payment list and status caches
      await globalMutate(
        (key: string) => key.startsWith("/api/v1/billing/payments"),
        (existing?: Payment[]) =>
          existing
            ? existing.map((p) => (p.id === verified.id ? verified : p))
            : existing,
        false,
      );

      await globalMutate(
        `/api/v1/billing/payments/${verified.id}`,
        verified,
        false,
      );

      return verified;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    createPayment,
    verifyPayment,
    redirectToGateway,
    loading,
    error,
  };
}
