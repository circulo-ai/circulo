import { useEffect, useState } from "react";

export function usePaymentStatus(paymentId: string | null) {
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) return;

    const fetchPayment = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/payments/${paymentId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch payment");
        }

        setPayment(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [paymentId]);

  return { payment, loading, error };
}
