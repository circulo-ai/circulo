import { BillingManager } from "@/lib/billing/billing-manager";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for heavy processing

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    const vercelCron = req.headers.get("x-vercel-cron");
    if (!vercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    console.log("Processing expired subscriptions...");
    await BillingManager.processExpiredSubscriptions();

    return NextResponse.json({
      success: true,
      message: "Subscription processing completed",
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
