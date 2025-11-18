import { InvoiceStatusChecker } from "@/lib/billing/invoice-status-checker";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds for Vercel Pro+

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("CRON_SECRET not configured");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  // Verify authorization (for self-hosted or external triggers)
  if (!verifyCronSecret(req)) {
    // For Vercel Cron, check if it's from Vercel
    const vercelCron = req.headers.get("x-vercel-cron");
    if (!vercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    console.log("Starting invoice status check...");
    await InvoiceStatusChecker.checkPendingInvoices();

    return NextResponse.json({
      success: true,
      message: "Invoice check completed",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job failed:", error);
    return NextResponse.json(
      {
        error: "Cron job failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
