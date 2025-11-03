import { db } from "@/db";
import { payment, wallet } from "@/db/schema";
import type { Wallet } from "@/db/schema";
import { PaymentService as BdkPaymentService, type PaymentFilters } from "@mhbdev/bdk";
import { Money, Payment as BdkPayment, PaymentStatus } from "@mhbdev/bdk";
import type { PaymentProvider, PaymentMethod as BdkPaymentMethod } from "@mhbdev/bdk";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * Drizzle-backed PaymentService integration using SizpayProvider via BDK.
 * Maps our existing payment table to BDK Payment shape.
 */
export class DrizzlePaymentService extends BdkPaymentService {
  constructor(private provider: PaymentProvider) {
    super();
  }

  async process(
    customerId: string,
    amount: Money,
    _paymentMethodId: string,
    options?: { subscriptionId?: string; description?: string; captureMethod?: "automatic" | "manual"; metadata?: Record<string, any> },
  ): Promise<BdkPayment> {
    const callbackUrl = options?.metadata?.callbackUrl as string | undefined;
    const now = new Date();
    // Provide a stub redirect payment method to satisfy provider typing
    const redirectMethod: BdkPaymentMethod = {
      id: "sizpay_redirect",
      customerId,
      type: "redirect",
      isDefault: false,
      providerId: "sizpay",
      providerMethodId: "redirect",
      metadata: { flow: "redirect" },
      createdAt: now,
      updatedAt: now,
    } as BdkPaymentMethod;

    const init = await this.provider.createPayment(amount, redirectMethod, {
      description: options?.description,
      captureMethod: options?.captureMethod,
      metadata: {
        ...options?.metadata,
        subscriptionId: options?.subscriptionId,
      },
    });
    const id = nanoid();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    // Ensure wallet exists for the user (required by payment schema)
    let userWallet: Wallet | undefined = await db.query.wallet.findFirst({ where: eq(wallet.userId, customerId) });
    if (!userWallet) {
      const walletId = nanoid();
      // Concurrency-safe create: ignore if another insert wins, then re-fetch
      await db
        .insert(wallet)
        .values({
          id: walletId,
          userId: customerId,
          balance: "0.00",
          currency: "USD",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      userWallet = await db.query.wallet.findFirst({ where: eq(wallet.userId, customerId) }) || ({
        id: walletId,
        userId: customerId,
        balance: "0.00",
        currency: "USD",
        createdAt: now,
        updatedAt: now,
      } as Wallet);
    }

    const ensuredWallet = userWallet as Wallet;
    await db.insert(payment).values({
      id,
      userId: customerId,
      walletId: ensuredWallet.id,
      provider: "sizpay",
      status: "awaiting_payment",
      amount: String(Math.round(amount.amount)),
      currency: amount.currency,
      providerToken: String(init.raw?.token || init.providerTransactionId),
      providerOrderId: String(init.raw?.orderId || ""),
      callbackUrl: String(callbackUrl || ""),
      gatewayUrl: String(init.raw?.gatewayUrl || ""),
      metadata: JSON.stringify({
        ...options?.metadata,
        subscriptionId: options?.subscriptionId,
        bdk: { status: init.status },
      }),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const statusMap: Record<string, PaymentStatus> = {
      awaiting_payment: PaymentStatus.PENDING,
      pending: PaymentStatus.PENDING,
      completed: PaymentStatus.SUCCEEDED,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELED,
      refunded: PaymentStatus.REFUNDED,
    } as const;

    const bdkPayment: BdkPayment = {
      id,
      customerId,
      subscriptionId: options?.subscriptionId,
      amount,
      status: statusMap["awaiting_payment"],
      paymentMethodId: "sizpay_redirect",
      providerId: "sizpay",
      providerTransactionId: init.providerTransactionId,
      metadata: {
        gatewayUrl: init.raw?.gatewayUrl,
        token: init.raw?.token,
        orderId: init.raw?.orderId,
      },
      createdAt: now,
      updatedAt: now,
    };

    return bdkPayment;
  }

  async refund(_paymentId: string): Promise<BdkPayment> {
    throw new Error("Refunds are not supported via SizPay API");
  }

  async getById(paymentId: string): Promise<BdkPayment | null> {
    const p = await db.query.payment.findFirst({ where: eq(payment.id, paymentId) });
    if (!p) return null;
    const statusMap: Record<string, PaymentStatus> = {
      awaiting_payment: PaymentStatus.PENDING,
      pending: PaymentStatus.PENDING,
      completed: PaymentStatus.SUCCEEDED,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELED,
      refunded: PaymentStatus.REFUNDED,
    } as const;
    return {
      id: p.id,
      customerId: p.userId,
      subscriptionId: undefined,
      amount: { amount: Number(p.amount), currency: p.currency },
      status: statusMap[p.status],
      paymentMethodId: "sizpay_redirect",
      providerId: p.provider,
      providerTransactionId: p.providerTransactionId ?? p.providerToken ?? undefined,
      metadata: p.metadata ? JSON.parse(p.metadata) : undefined,
      createdAt: p.createdAt!,
      updatedAt: p.updatedAt!,
    };
  }

  async listByCustomer(customerId: string, filters?: PaymentFilters): Promise<BdkPayment[]> {
    const rows = await db.query.payment.findMany({
      where: filters?.status
        ? and(eq(payment.userId, customerId))
        : eq(payment.userId, customerId),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      limit: filters?.limit ?? 20,
    });
    const statusMap: Record<string, PaymentStatus> = {
      awaiting_payment: PaymentStatus.PENDING,
      pending: PaymentStatus.PENDING,
      completed: PaymentStatus.SUCCEEDED,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELED,
      refunded: PaymentStatus.REFUNDED,
    } as const;
    return rows.map((p) => ({
      id: p.id,
      customerId: p.userId,
      subscriptionId: undefined,
      amount: { amount: Number(p.amount), currency: p.currency },
      status: statusMap[p.status],
      paymentMethodId: "sizpay_redirect",
      providerId: p.provider,
      providerTransactionId: p.providerTransactionId ?? p.providerToken ?? undefined,
      metadata: p.metadata ? JSON.parse(p.metadata) : undefined,
      createdAt: p.createdAt!,
      updatedAt: p.updatedAt!,
    }));
  }

  async retry(paymentId: string): Promise<BdkPayment> {
    const existing = await this.getById(paymentId);
    if (!existing) throw new Error("Payment not found");
    const amount = existing.amount;
    const now = new Date();
    const redirectMethod: BdkPaymentMethod = {
      id: "sizpay_redirect",
      customerId: existing.customerId,
      type: "redirect",
      isDefault: false,
      providerId: "sizpay",
      providerMethodId: "redirect",
      metadata: { flow: "redirect" },
      createdAt: now,
      updatedAt: now,
    } as BdkPaymentMethod;

    const init = await this.provider.createPayment(amount, redirectMethod, {
      metadata: existing.metadata ?? {},
    });
    await db
      .update(payment)
      .set({
        providerToken: String(init.raw?.token || init.providerTransactionId),
        providerOrderId: String(init.raw?.orderId || ""),
        gatewayUrl: String(init.raw?.gatewayUrl || ""),
        status: "awaiting_payment",
        updatedAt: new Date(),
      })
      .where(eq(payment.id, paymentId));
    return {
      ...existing,
      status: PaymentStatus.PENDING,
      providerTransactionId: init.providerTransactionId,
      metadata: {
        ...(existing.metadata ?? {}),
        gatewayUrl: init.raw?.gatewayUrl,
        token: init.raw?.token,
        orderId: init.raw?.orderId,
      },
      updatedAt: new Date(),
    };
  }
}

export default DrizzlePaymentService;