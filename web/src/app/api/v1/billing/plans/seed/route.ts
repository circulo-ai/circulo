import { db } from "@/db";
import { subscriptionPlan } from "@/db/schema";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";

/**
 * Dev-only seed endpoint to populate default subscription plans.
 * Prevents empty pricing table when DB has no plans yet.
 */
export async function POST() {
  try {
    if (env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Forbidden in production" },
        { status: 403 },
      );
    }

    // If any plan exists, skip seeding
    const existing = await db.select().from(subscriptionPlan).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({
        message: "Plans already exist — seeding skipped",
      });
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
        features: {
          list: [
            "Basic chat access",
            "Community support",
            "Up to 3 saved agents",
          ],
        },
        metadata: {
          tier: "starter",
          version: 2,
          overagePolicy: "hard",
          profitMultiplier: 1.2,
          rates: {
            chat_tokens: { included: 500_000, unitPriceUSD: 0.000002 },
            image_requests: { included: 100, unitPriceUSD: 0.05 },
            embeddings_calls: { included: 200, unitPriceUSD: 0.001 },
            assistant_calls: { included: 1_000, unitPriceUSD: 0.0005 },
            audio_minutes: { included: 60, unitPriceUSD: 0.006 },
          },
        },
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
        features: {
          list: [
            "Priority chat",
            "Advanced prompts",
            "Up to 10 saved agents",
            "Basic usage analytics",
          ],
        },
        metadata: {
          tier: "adventurer",
          version: 2,
          overagePolicy: "hard",
          profitMultiplier: 1.15,
          rates: {
            chat_tokens: { included: 1_000_000, unitPriceUSD: 0.000002 },
            image_requests: { included: 250, unitPriceUSD: 0.045 },
            embeddings_calls: { included: 500, unitPriceUSD: 0.001 },
            assistant_calls: { included: 2_000, unitPriceUSD: 0.00045 },
            audio_minutes: { included: 120, unitPriceUSD: 0.0055 },
          },
        },
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
        features: {
          list: [
            "Faster responses",
            "Custom agents",
            "Unlimited saved agents",
            "Advanced analytics",
            "Email summaries",
          ],
        },
        metadata: {
          tier: "hero",
          version: 2,
          overagePolicy: "hard",
          profitMultiplier: 1.1,
          rates: {
            chat_tokens: { included: 2_500_000, unitPriceUSD: 0.000002 },
            image_requests: { included: 750, unitPriceUSD: 0.04 },
            embeddings_calls: { included: 1_500, unitPriceUSD: 0.0009 },
            assistant_calls: { included: 5_000, unitPriceUSD: 0.0004 },
            audio_minutes: { included: 300, unitPriceUSD: 0.005 },
          },
        },
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
        features: {
          list: [
            "Team features",
            "SSO-ready",
            "Priority support",
            "Usage API",
            "Audit logs",
          ],
        },
        metadata: {
          tier: "legend",
          version: 2,
          overagePolicy: "soft",
          profitMultiplier: 1.05,
          rates: {
            chat_tokens: { included: 5_000_000, unitPriceUSD: 0.000002 },
            image_requests: { included: 2_000, unitPriceUSD: 0.035 },
            embeddings_calls: { included: 3_000, unitPriceUSD: 0.0008 },
            assistant_calls: { included: 10_000, unitPriceUSD: 0.00035 },
            audio_minutes: { included: 1_000, unitPriceUSD: 0.0045 },
          },
        },
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.insert(subscriptionPlan).values(plans).onConflictDoNothing();

    return NextResponse.json({ success: true, count: plans.length });
  } catch (error) {
    console.error("Seed plans error:", error);
    return NextResponse.json(
      { error: "Failed to seed plans" },
      { status: 500 },
    );
  }
}
