import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { subscriptionPlan } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const plans = await db.query.subscriptionPlan.findMany({
      where: eq(subscriptionPlan.active, true),
      orderBy: (p, { asc }) => [asc(p.amount)],
    });

    return NextResponse.json(
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        amount: Number(p.amount),
        currency: p.currency,
        interval: p.interval,
        intervalCount: p.intervalCount,
        trialPeriodDays: p.trialPeriodDays ?? undefined,
        features: (p.features ?? {}) as Record<string, any>,
        metadata: (p.metadata ?? {}) as Record<string, any>,
        active: p.active,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
    );
  } catch (error) {
    console.error("List subscription plans error:", error);
    return NextResponse.json({ error: "Failed to list plans" }, { status: 500 });
  }
}