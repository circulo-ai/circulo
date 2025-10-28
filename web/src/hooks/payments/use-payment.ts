import { useState } from "react";

interface CreatePaymentParams {
  amount: number;
  metadata?: Record<string, any>;
}

interface PaymentResult {
  paymentId: string;
  token: string;
  gatewayUrl: string;
  orderId: string;
}

export function usePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPayment = async (
    params: CreatePaymentParams,
  ): Promise<PaymentResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment");
      }

      return data.data;
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

  const verifyPayment = async (token: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to verify payment");
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    createPayment,
    redirectToGateway,
    verifyPayment,
  };
}
