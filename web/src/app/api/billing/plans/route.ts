import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema/billing";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/billing/plans - List all available plans
 */
export async function GET() {
  try {
    const plans = await db.query.subscriptionPlans.findMany({
      where: eq(subscriptionPlans.isActive, true),
      orderBy: asc(subscriptionPlans.usdPrice),
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Get plans error:", error);
    return NextResponse.json(
      { error: "Failed to fetch plans" },
      { status: 500 },
    );
  }
}
