export interface Payment {
  id: string;
  amount: string | number;
  status: "pending" | "awaiting_payment" | "completed" | "failed" | "cancelled";
  createdAt: string | Date;
  paidAt?: string | Date;
  provider: string;
  cardNumber?: string;
}

export interface CreatePaymentParams {
  amount: number;
  metadata?: Record<string, any>;
  currency?: "IRR" | "USD";
}

export interface PaymentResult {
  paymentId: string;
  token?: string;
  gatewayUrl: string;
  orderId?: string;
}
