import { useEffect, useState } from "react";

interface Payment {
  id: string;
  amount: string;
  status: string;
  createdAt: Date;
  paidAt?: Date;
  provider: string;
  cardNumber?: string;
}

export function usePaymentList(limit = 10) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const response = await fetch(`/api/v1/payments?limit=${limit}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch payments");
        }

        setPayments(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [limit]);

  return { payments, loading, error };
}
