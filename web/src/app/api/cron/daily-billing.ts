import { BillingManager } from "@/lib/billing/billing-manager";
import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";

/**
 * Run this daily via cron job to handle subscription renewals and expirations
 */
export async function processDailyBilling() {
  console.log('🔄 Processing daily billing tasks...');

  try {
    // Process expired subscriptions
    await BillingManager.processExpiredSubscriptions();
    console.log('✓ Processed expired subscriptions');

    // Add other daily tasks here
    // - Send payment reminders
    // - Generate usage reports
    // - Clean up old usage metrics

    console.log('✓ Daily billing tasks completed');
  } catch (error) {
    console.error('✗ Daily billing tasks failed:', error);
    throw error;
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await processDailyBilling();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
