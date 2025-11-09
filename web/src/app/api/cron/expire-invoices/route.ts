import { NextRequest, NextResponse } from 'next/server';
import { InvoiceStatusChecker } from "@/lib/billing/invoice-status-checker";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    const vercelCron = req.headers.get('x-vercel-cron');
    if (!vercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('Expiring overdue invoices...');
    await InvoiceStatusChecker.expireOverdueInvoices();

    return NextResponse.json({
      success: true,
      message: 'Invoice expiration completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}