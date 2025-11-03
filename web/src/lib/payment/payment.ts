import { db } from '@/db';
import { payments, paymentMethods } from '@/db/schema';
import { eq, and, inArray, gte, lte } from 'drizzle-orm';
import { PaymentService as BDKPaymentService, ProcessPaymentOptions, PaymentFilters } from '@mhbdev/bdk/services';
import { Payment, PaymentMethod } from '@mhbdev/bdk/core';
import { Money, PaymentStatus } from '@mhbdev/bdk/core';
import { InMemoryPaymentProviderRegistry } from './in-memory-registry';
import { DefaultProviderSelectionStrategy } from './default-strategy';
import { randomUUID } from 'crypto';
import { SizPayProvider } from "@/lib/payment/sizpay/sizpay-provider";

export class PaymentService extends BDKPaymentService {
  constructor(
    private readonly registry: InMemoryPaymentProviderRegistry,
    private readonly strategy: DefaultProviderSelectionStrategy,
  ) { super(); }

  async process(customerId: string, amount: Money, paymentMethodId: string, options?: ProcessPaymentOptions): Promise<Payment> {
    const idempotencyKey = (options as any)?.idempotencyKey ?? options?.metadata?.idempotencyKey;

    // If an idempotency key is provided, short-circuit if a payment already exists
    if (idempotencyKey) {
      const existing = (await db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey)).execute()).at(0);
      if (existing) {
        return {
          id: existing.id,
          customerId: existing.userId,
          subscriptionId: existing.subscriptionId || undefined,
          amount: { amount: Number(existing.amount), currency: existing.currency },
          status: existing.status as PaymentStatus,
          paymentMethodId: existing.paymentMethodId,
          providerId: existing.providerId || undefined,
          providerTransactionId: existing.providerTransactionId || undefined,
          failureReason: existing.failureReason || undefined,
          metadata: existing.metadata || undefined,
          createdAt: new Date(existing.createdAt!),
          updatedAt: new Date(existing.updatedAt!),
        };
      }
    }

    const pmRow = (await db.select().from(paymentMethods).where(eq(paymentMethods.id, paymentMethodId)).execute()).at(0);
    if (!pmRow) throw new Error('Payment method not found');
    const paymentMethod: PaymentMethod = {
      id: pmRow.id,
      customerId: pmRow.userId,
      type: pmRow.type,
      providerId: pmRow.providerId,
      providerMethodId: pmRow.providerMethodId,
      isDefault: !!pmRow.isDefault,
      lastFour: pmRow.lastFour || undefined,
      expiryMonth: pmRow.expiryMonth || undefined,
      expiryYear: pmRow.expiryYear || undefined,
      metadata: pmRow.metadata || undefined,
      createdAt: new Date(pmRow.createdAt!),
      updatedAt: new Date(pmRow.updatedAt!),
    };

    const provider = await this.strategy.selectProvider({ customerId, amount, paymentMethod });
    const result = await provider.createPayment(amount, paymentMethod, options);

    const id = randomUUID();
    const now = new Date();
    const row = {
      id,
      userId: customerId,
      subscriptionId: options?.subscriptionId || null,
      amount: amount.amount.toString(),
      currency: amount.currency,
      status: result.success ? result.status : PaymentStatus.FAILED,
      paymentMethodId,
      providerId: provider.providerId,
      providerTransactionId: result.providerTransactionId || null,
      failureReason: result.failureReason || null,
      metadata: options?.metadata || null,
      idempotencyKey: idempotencyKey || null,
      createdAt: now,
      updatedAt: now,
    };
    // Insert atomically and guard against duplicate provider transactions
    await db.transaction(async (tx) => {
      // Prefer idempotency key match first
      if (idempotencyKey) {
        const existing = (await tx.select().from(payments)
          .where(eq(payments.idempotencyKey, idempotencyKey))
          .execute()).at(0);
        if (existing) {
          return; // already recorded
        }
      }
      // If provider transaction exists, avoid duplicate insertions
      if (row.providerTransactionId) {
        const existing = (await tx.select().from(payments)
          .where(and(eq(payments.providerId, row.providerId!), eq(payments.providerTransactionId, row.providerTransactionId)))
          .execute()).at(0);
        if (existing) {
          return; // already recorded
        }
      }
      try {
        await tx.insert(payments)
          .values(row)
          .execute();
      } catch (e: any) {
        // Handle race: unique constraint on (providerId, providerTransactionId)
        if (idempotencyKey) {
          const conflictByKey = (await tx.select().from(payments)
            .where(eq(payments.idempotencyKey, idempotencyKey))
            .execute()).at(0);
          if (!conflictByKey) throw e;
        } else if (row.providerTransactionId) {
          const conflict = (await tx.select().from(payments)
            .where(and(eq(payments.providerId, row.providerId!), eq(payments.providerTransactionId, row.providerTransactionId)))
            .execute()).at(0);
          if (!conflict) throw e;
        } else {
          throw e;
        }
      }
    });

    const payment: Payment = {
      id,
      customerId,
      subscriptionId: options?.subscriptionId || undefined,
      amount,
      status: row.status as PaymentStatus,
      paymentMethodId,
      providerId: provider.providerId,
      providerTransactionId: result.providerTransactionId || undefined,
      failureReason: result.failureReason || undefined,
      metadata: options?.metadata || undefined,
      createdAt: new Date(row.createdAt!),
      updatedAt: new Date(row.updatedAt!),
    };
    return payment;
  }

  async refund(paymentId: string, amount?: Money, reason?: string): Promise<Payment> {
    const p = await this.getById(paymentId);
    if (!p) throw new Error('Payment not found');
    if (p.status === PaymentStatus.REFUNDED) {
      return p; // idempotent: already refunded
    }
    if (!p.providerTransactionId || !p.providerId) throw new Error('Missing provider info');
    const provider = this.registry.getProvider(p.providerId);
    if (!provider) throw new Error('Provider not registered');
    try {
      await provider.refundPayment(p.providerTransactionId, amount);
      const now = new Date();
      await db.transaction(async (tx) => {
        const row = (await tx.select().from(payments).where(eq(payments.id, paymentId)).execute()).at(0);
        if (!row) throw new Error('Payment not found');
        if (row.status !== PaymentStatus.REFUNDED) {
          await tx.update(payments)
            .set({ status: PaymentStatus.REFUNDED, updatedAt: now, failureReason: reason || null })
            .where(eq(payments.id, paymentId))
            .execute();
        }
      });
      return { ...p, status: PaymentStatus.REFUNDED, updatedAt: now };
    } catch (e: any) {
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.update(payments)
          .set({ failureReason: e?.message || 'Refund unsupported', updatedAt: now })
          .where(eq(payments.id, paymentId))
          .execute();
      });
      return { ...p, failureReason: e?.message || 'Refund unsupported', updatedAt: now };
    }
  }

  async getById(paymentId: string): Promise<Payment | null> {
    const row = (await db.select().from(payments).where(eq(payments.id, paymentId)).execute()).at(0);
    if (!row) return null;
    return {
      id: row.id,
      customerId: row.userId,
      subscriptionId: row.subscriptionId || undefined,
      amount: { amount: Number(row.amount), currency: row.currency },
      status: row.status as PaymentStatus,
      paymentMethodId: row.paymentMethodId,
      providerId: row.providerId || undefined,
      providerTransactionId: row.providerTransactionId || undefined,
      failureReason: row.failureReason || undefined,
      metadata: row.metadata || undefined,
      createdAt: new Date(row.createdAt!),
      updatedAt: new Date(row.updatedAt!),
    };
  }

  async listByCustomer(customerId: string, filters?: PaymentFilters): Promise<Payment[]> {
    const where = [eq(payments.userId, customerId)];
    if (filters?.status?.length) where.push(inArray(payments.status, filters.status as string[]));
    if (filters?.dateFrom) where.push(gte(payments.createdAt, filters.dateFrom));
    if (filters?.dateTo) where.push(lte(payments.createdAt, filters.dateTo));
    const rows = await db.select().from(payments).where(and(...where)).execute();
    return rows.map((row) => ({
      id: row.id,
      customerId: row.userId,
      subscriptionId: row.subscriptionId || undefined,
      amount: { amount: Number(row.amount), currency: row.currency },
      status: row.status as PaymentStatus,
      paymentMethodId: row.paymentMethodId,
      providerId: row.providerId || undefined,
      providerTransactionId: row.providerTransactionId || undefined,
      failureReason: row.failureReason || undefined,
      metadata: row.metadata || undefined,
      createdAt: new Date(row.createdAt!),
      updatedAt: new Date(row.updatedAt!),
    }));
  }

  async retry(paymentId: string): Promise<Payment> {
    const p = await this.getById(paymentId);
    if (!p) throw new Error('Payment not found');
    if (p.status === PaymentStatus.SUCCEEDED) {
      return p; // idempotent: already succeeded
    }
    if (!p.providerTransactionId || !p.providerId) throw new Error('Missing provider info');
    const provider = this.registry.getProvider(p.providerId) as SizPayProvider;
    if (!provider) throw new Error('Provider not registered');
    const result = await provider.capturePayment(p.providerTransactionId);
    const newStatus = result.success ? result.status : PaymentStatus.FAILED;
    const failureReason = result.failureReason || undefined;
    const now = new Date();
    await db.transaction(async (tx) => {
      const row = (await tx.select().from(payments).where(eq(payments.id, paymentId)).execute()).at(0);
      if (!row) throw new Error('Payment not found');
      if (row.status !== PaymentStatus.SUCCEEDED) {
        await tx.update(payments)
          .set({ status: newStatus, failureReason: failureReason || null, updatedAt: now })
          .where(eq(payments.id, paymentId))
          .execute();
      }
    });
    return { ...p, status: newStatus, failureReason, updatedAt: now };
  }
}

const registry = new InMemoryPaymentProviderRegistry();
const strategy = new DefaultProviderSelectionStrategy(registry);
export const paymentService = new PaymentService(registry, strategy);
