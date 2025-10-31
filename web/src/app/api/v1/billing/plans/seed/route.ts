import { NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionPlan } from "@/db/schema";
import { nanoid } from "nanoid";

/**
 * Dev-only seed endpoint to populate default subscription plans.
 * Prevents empty pricing table when DB has no plans yet.
 */
export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Forbidden in production" }, { status: 403 });
    }

    // If any plan exists, skip seeding
    const existing = await db.select().from(subscriptionPlan).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ message: "Plans already exist — seeding skipped" });
    }

    const now = new Date();
    type PlanInsert = typeof subscriptionPlan.$inferInsert;
    const plans: PlanInsert[] = [
      {
        id: "starter",
        name: "Starter",
        description: "For casual adventurers getting started",
        amount: "250000.00", // IRR
        currency: "IRR",
        interval: "month",
        intervalCount: 1,
        trialPeriodDays: 7,
        features: { list: ["Basic chat access", "Community support", "Up to 3 saved agents"] },
        metadata: { tier: "starter", version: 1 },
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "adventurer",
        name: "Adventurer",
        description: "Best for regular players and campaign runners",
        amount: "600000.00",
        currency: "IRR",
        interval: "month",
        intervalCount: 1,
        trialPeriodDays: 7,
        features: { list: ["Priority chat", "Advanced prompts", "Up to 10 saved agents", "Basic usage analytics"] },
        metadata: { tier: "adventurer", version: 1 },
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "hero",
        name: "Hero",
        description: "Power features for heavy users",
        amount: "1200000.00",
        currency: "IRR",
        interval: "month",
        intervalCount: 1,
        trialPeriodDays: 7,
        features: { list: ["Faster responses", "Custom agents", "Unlimited saved agents", "Advanced analytics", "Email summaries"] },
        metadata: { tier: "hero", version: 1 },
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "legend",
        name: "Legend",
        description: "For teams and pro creators",
        amount: "2400000.00",
        currency: "IRR",
        interval: "month",
        intervalCount: 1,
        trialPeriodDays: 14,
        features: { list: ["Team features", "SSO-ready", "Priority support", "Usage API", "Audit logs"] },
        metadata: { tier: "legend", version: 1 },
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.insert(subscriptionPlan).values(plans).onConflictDoNothing();

    return NextResponse.json({ success: true, count: plans.length });
  } catch (error) {
    console.error("Seed plans error:", error);
    return NextResponse.json({ error: "Failed to seed plans" }, { status: 500 });
  }
}