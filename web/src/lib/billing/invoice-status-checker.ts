import { db } from '@/db';
import { invoices } from '@/db/schema/billing';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { getProvider } from '.';

export class InvoiceStatusChecker {
  /**
   * Check pending invoices and sync with payment provider
   * Run this via cron every 5-10 minutes
   */
  static async checkPendingInvoices(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get pending invoices from last 24 hours
    const pendingInvoices = await db.query.invoices.findMany({
      where: and(
        inArray(invoices.status, ['pending', 'failed']),
        // Only check recent invoices
        lt(invoices.createdAt, oneDayAgo)
      ),
      limit: 100, // Process in batches
    });

    console.log(`Checking ${pendingInvoices.length} pending invoices...`);

    for (const invoice of pendingInvoices) {
      try {
        const provider = getProvider(invoice.provider);
        const status = await provider.getInvoiceStatus(invoice.providerInvoiceId);

        // Update if status changed
        if (status !== invoice.status) {
          console.log(`Invoice ${invoice.id} status changed: ${invoice.status} -> ${status}`);

          await db
            .update(invoices)
            .set({
              status,
              paidAt: status === 'paid' ? new Date() : undefined,
              failedAt: status === 'failed' ? new Date() : undefined,
            })
            .where(eq(invoices.id, invoice.id));

          // Trigger subscription activation if paid
          if (status === 'paid' && invoice.type === 'subscription' && invoice.subscriptionId) {
            // Import BillingManager to avoid circular dependency
            const { BillingManager } = await import('./billing-manager');
            const manager = new BillingManager(provider);
            await manager['activateSubscription'](invoice.subscriptionId);
          }
        }
      } catch (error) {
        console.error(`Error checking invoice ${invoice.id}:`, error);
        // Continue with next invoice
      }
    }
  }

  /**
   * Mark expired invoices that passed their due date
   */
  static async expireOverdueInvoices(): Promise<void> {
    const now = new Date();

    const overdueInvoices = await db.query.invoices.findMany({
      where: and(
        eq(invoices.status, 'pending'),
        lt(invoices.dueDate, now)
      ),
    });

    for (const invoice of overdueInvoices) {
      await db
        .update(invoices)
        .set({ status: 'expired' })
        .where(eq(invoices.id, invoice.id));

      console.log(`Expired invoice ${invoice.id}`);
    }
  }
}

// Usage in your cron job:
// import { InvoiceStatusChecker } from '@/billing/invoice-status-checker';
//
// // Every 10 minutes
// cron.schedule('*/10 * * * *', async () => {
//   await InvoiceStatusChecker.checkPendingInvoices();
// });
//
// // Daily at midnight
// cron.schedule('0 0 * * *', async () => {
//   await InvoiceStatusChecker.expireOverdueInvoices();
// });