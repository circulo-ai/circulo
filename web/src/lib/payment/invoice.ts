import { db } from '@/db';
import { invoices, invoiceLineItems } from '@/db/schema';
import { eq, and, inArray, gte, lte } from 'drizzle-orm';
import { InvoiceService as BDKInvoiceService, InvoiceCreateOptions, InvoiceFilters } from '@mhbdev/bdk/services';
import { Invoice, InvoiceLineItem as BdkInvoiceLineItem } from '@mhbdev/bdk/core';
import { randomUUID } from 'crypto';

export class InvoiceService extends BDKInvoiceService {
  async create(customerId: string, lineItems: BdkInvoiceLineItem[], options?: InvoiceCreateOptions): Promise<Invoice> {
    const subtotal = lineItems.reduce((sum, li) => sum + li.amount.amount, 0);
    const currency = lineItems[0]?.amount.currency || 'IRT';
    const taxAmount = 0;
    const total = subtotal + taxAmount;
    const id = randomUUID();
    const number = `INV-${Date.now()}`;
    const now = new Date();
    const due = options?.dueDate || new Date(now.getTime() + 7 * 86400000);

    await db.transaction(async (tx) => {
      await tx.insert(invoices).values([{
        id,
        userId: customerId,
        subscriptionId: options?.subscriptionId || null,
        number,
        status: 'draft',
        subtotalAmount: subtotal.toString(),
        subtotalCurrency: currency,
        taxAmount: taxAmount.toString(),
        taxCurrency: currency,
        totalAmount: total.toString(),
        totalCurrency: currency,
        dueDate: due,
        paidAt: null,
        metadata: options?.metadata || null,
        createdAt: now,
        updatedAt: now,
      }]).execute();

      if (lineItems.length) {
        await tx.insert(invoiceLineItems).values(
          lineItems.map((li) => ({
            id: randomUUID(),
            invoiceId: id,
            description: li.description,
            quantity: li.quantity,
            unitAmount: li.unitAmount.amount.toString(),
            unitCurrency: li.unitAmount.currency,
            amount: li.amount.amount.toString(),
            currency: li.amount.currency,
            metadata: li.metadata || null,
            createdAt: now,
          }))
        ).execute();
      }
    });

    return {
      id,
      customerId,
      subscriptionId: options?.subscriptionId || undefined,
      number,
      status: 'draft',
      subtotal: { amount: subtotal, currency },
      tax: { amount: taxAmount, currency },
      total: { amount: total, currency },
      dueDate: due,
      paidAt: undefined,
      lineItems,
      metadata: options?.metadata || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  async finalize(invoiceId: string): Promise<Invoice> {
    const now = new Date();
    await db.update(invoices)
      .set({ status: 'open', updatedAt: now })
      .where(eq(invoices.id, invoiceId))
      .execute();
    const inv = await this.getById(invoiceId);
    if (!inv) throw new Error('Invoice not found');
    return { ...inv, status: 'open', updatedAt: now };
  }

  async markPaid(invoiceId: string, _paymentId: string): Promise<Invoice> {
    const now = new Date();
    await db.update(invoices)
      .set({ status: 'paid', paidAt: now, updatedAt: now })
      .where(eq(invoices.id, invoiceId))
      .execute();
    const inv = await this.getById(invoiceId);
    if (!inv) throw new Error('Invoice not found');
    return { ...inv, status: 'paid', paidAt: now, updatedAt: now };
  }

  async void(invoiceId: string): Promise<Invoice> {
    const now = new Date();
    await db.update(invoices)
      .set({ status: 'void', updatedAt: now })
      .where(eq(invoices.id, invoiceId))
      .execute();
    const inv = await this.getById(invoiceId);
    if (!inv) throw new Error('Invoice not found');
    return { ...inv, status: 'void', updatedAt: now };
  }

  async getById(invoiceId: string): Promise<Invoice | null> {
    const row = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).execute()).at(0);
    if (!row) return null;
    const items = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));
    const lineItems: BdkInvoiceLineItem[] = items.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitAmount: { amount: Number(li.unitAmount), currency: li.unitCurrency },
      amount: { amount: Number(li.amount), currency: li.currency },
      metadata: li.metadata || undefined,
    }));
    return {
      id: row.id,
      customerId: row.userId,
      subscriptionId: row.subscriptionId || undefined,
      number: row.number,
      status: row.status as Invoice['status'],
      subtotal: { amount: Number(row.subtotalAmount), currency: row.subtotalCurrency },
      tax: row.taxAmount != null ? { amount: Number(row.taxAmount), currency: row.taxCurrency! } : undefined,
      total: { amount: Number(row.totalAmount), currency: row.totalCurrency },
      dueDate: new Date(row.dueDate!),
      paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
      lineItems,
      metadata: row.metadata || undefined,
      createdAt: new Date(row.createdAt!),
      updatedAt: new Date(row.updatedAt!),
    };
  }

  async listByCustomer(customerId: string, filters?: InvoiceFilters): Promise<Invoice[]> {
    const where = [eq(invoices.userId, customerId)];
    if (filters?.status?.length) where.push(inArray(invoices.status, filters.status as string[]));
    if (filters?.dateFrom) where.push(gte(invoices.createdAt, filters.dateFrom));
    if (filters?.dateTo) where.push(lte(invoices.createdAt, filters.dateTo));
    const rows = await db.select().from(invoices).where(and(...where)).execute();
    const result: Invoice[] = [];
    for (const row of rows) {
      const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id)).execute();
      const lineItems: BdkInvoiceLineItem[] = items.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitAmount: { amount: Number(li.unitAmount), currency: li.unitCurrency },
        amount: { amount: Number(li.amount), currency: li.currency },
        metadata: li.metadata || undefined,
      }));
      result.push({
        id: row.id,
        customerId: row.userId,
        subscriptionId: row.subscriptionId || undefined,
        number: row.number,
        status: row.status as Invoice['status'],
        subtotal: { amount: Number(row.subtotalAmount), currency: row.subtotalCurrency },
        tax: row.taxAmount != null ? { amount: Number(row.taxAmount), currency: row.taxCurrency! } : undefined,
        total: { amount: Number(row.totalAmount), currency: row.totalCurrency },
        dueDate: new Date(row.dueDate!),
        paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
        lineItems,
        metadata: row.metadata || undefined,
        createdAt: new Date(row.createdAt!),
        updatedAt: new Date(row.updatedAt!),
      });
    }
    return result;
  }
}