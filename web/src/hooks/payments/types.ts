export interface Payment {
  id: string;
  amount: string;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt?: string;
  provider: string;
  cardNumber?: string;
}

export interface CreatePaymentParams {
  amount: number;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentId: string;
  token: string;
  gatewayUrl: string;
  orderId: string;
}
