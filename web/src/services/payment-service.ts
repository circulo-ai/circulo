import { db } from "@/db";
import { payment, transaction, wallet } from "@/db/schema";
import { SizPayClient } from "@/lib/sizpay/client";
import { SizPayConfirmResponse } from "@/lib/sizpay/types";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface CreatePaymentParams {
  userId: string;
  amount: number; // in Tomans
  callbackUrl: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentId: string;
  token: string;
  gatewayUrl: string;
  orderId: string;
}

export class PaymentService {
  constructor(private sizpayClient: SizPayClient) {}

  /**
   * Create a new payment
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    // Get user's wallet
    const userWallet = await db.query.wallet.findFirst({
      where: eq(wallet.userId, params.userId),
    });

    if (!userWallet) {
      throw new Error("Wallet not found for user");
    }

    // Create payment record
    const paymentId = nanoid();

    // Create transaction through SizPay
    const sizpayResult = await this.sizpayClient.createTransaction({
      amount: params.amount,
      callbackUrl: params.callbackUrl,
      customExtraInfo: {
        paymentId,
        userId: params.userId,
        ...params.metadata,
      },
    });

    // Calculate expiry (30 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Insert payment record
    await db.insert(payment).values({
      id: paymentId,
      userId: params.userId,
      walletId: userWallet.id,
      provider: "sizpay",
      status: "awaiting_payment",
      amount: params.amount.toString(),
      currency: "IRR",
      providerToken: sizpayResult.token,
      providerOrderId: sizpayResult.orderId,
      callbackUrl: params.callbackUrl,
      gatewayUrl: sizpayResult.gatewayUrl,
      metadata: JSON.stringify(params.metadata || {}),
      expiresAt,
    });

    return {
      paymentId,
      token: sizpayResult.token,
      gatewayUrl: sizpayResult.gatewayUrl,
      orderId: sizpayResult.orderId,
    };
  }

  /**
   * Verify and complete a payment
   */
  async verifyPayment(token: string): Promise<{
    success: boolean;
    payment: any;
    message?: string;
  }> {
    // Find payment by token
    const existingPayment = await db.query.payment.findFirst({
      where: eq(payment.providerToken, token),
    });

    if (!existingPayment) {
      return {
        success: false,
        payment: null,
        message: "Payment not found",
      };
    }

    // Check if already processed
    if (existingPayment.status === "completed") {
      return {
        success: true,
        payment: existingPayment,
        message: "Payment already completed",
      };
    }

    if (
      existingPayment.status === "failed" ||
      existingPayment.status === "cancelled"
    ) {
      return {
        success: false,
        payment: existingPayment,
        message: "Payment was not successful",
      };
    }

    try {
      // Confirm with SizPay
      const confirmResult = await this.sizpayClient.confirm(token);

      // Update payment record
      const updatedPayment = await this.completePayment(
        existingPayment.id,
        confirmResult,
      );

      return {
        success: true,
        payment: updatedPayment,
        message: "Payment verified successfully",
      };
    } catch (error) {
      // Mark payment as failed
      await db
        .update(payment)
        .set({
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(payment.id, existingPayment.id));

      return {
        success: false,
        payment: existingPayment,
        message: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Complete payment and update wallet
   */
  private async completePayment(
    paymentId: string,
    confirmResult: SizPayConfirmResponse,
  ) {
    return await db.transaction(async (tx) => {
      // Get payment details
      const paymentRecord = await tx.query.payment.findFirst({
        where: eq(payment.id, paymentId),
      });

      if (!paymentRecord) {
        throw new Error("Payment not found");
      }

      // Get wallet
      const userWallet = await tx.query.wallet.findFirst({
        where: eq(wallet.id, paymentRecord.walletId),
      });

      if (!userWallet) {
        throw new Error("Wallet not found");
      }

      const amount = parseFloat(paymentRecord.amount);
      const currentBalance = parseFloat(userWallet.balance);
      const newBalance = currentBalance + amount;

      // Update wallet balance
      await tx
        .update(wallet)
        .set({
          balance: newBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(wallet.id, userWallet.id));

      // Create transaction record
      const transactionId = nanoid();
      await tx.insert(transaction).values({
        id: transactionId,
        userId: paymentRecord.userId,
        walletId: userWallet.id,
        type: "deposit",
        status: "completed",
        amount: amount.toFixed(4),
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        description: `Deposit via SizPay - Order #${confirmResult.orderId}`,
        metadata: {
          provider: "sizpay",
          paymentId: paymentId,
          refNo: confirmResult.refNo,
          traceNo: confirmResult.traceNo,
          transNo: confirmResult.transNo,
          cardNo: confirmResult.cardNo,
        },
      });

      // Update payment record
      const updatedPayment = await tx
        .update(payment)
        .set({
          status: "completed",
          transactionId: transactionId,
          providerTransactionId: confirmResult.transNo,
          providerRefNo: confirmResult.refNo,
          providerTraceNo: confirmResult.traceNo,
          cardNumber: confirmResult.cardNo?.slice(-4), // Last 4 digits only
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payment.id, paymentId))
        .returning();

      return updatedPayment[0];
    });
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: string) {
    return await db.query.payment.findFirst({
      where: eq(payment.id, paymentId),
    });
  }

  /**
   * Get user payments
   */
  async getUserPayments(userId: string, limit = 10) {
    return await db.query.payment.findMany({
      where: eq(payment.userId, userId),
      limit,
      orderBy: (payment, { desc }) => [desc(payment.createdAt)],
    });
  }

  /**
   * Cancel expired payments (run as cron job)
   */
  async cancelExpiredPayments() {
    const now = new Date();

    await db
      .update(payment)
      .set({
        status: "cancelled",
        errorMessage: "Payment expired",
        updatedAt: now,
      })
      .where(
        and(
          eq(payment.status, "awaiting_payment"),
          // expiresAt < now
        ),
      );
  }
}
