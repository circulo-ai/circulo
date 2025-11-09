import { db } from "@/db";
import { subscription } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subs = await db.query.subscription.findMany({
      where: eq(subscription.userId, session.user.id),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    const planIds = Array.from(new Set(subs.map((s) => s.planId)));
    const plans = planIds.length
      ? await db.query.subscriptionPlan.findMany({
          where: (p, { inArray }) => inArray(p.id, planIds),
        })
      : [];
    const planById = new Map(plans.map((p) => [p.id, p] as const));

    return NextResponse.json(
      subs.map((s) => {
        const p = planById.get(s.planId);
        return {
          id: s.id,
          planId: s.planId,
          status: s.status,
          currentPeriodStart: s.currentPeriodStart,
          currentPeriodEnd: s.currentPeriodEnd,
          trialStart: s.trialStart ?? undefined,
          trialEnd: s.trialEnd ?? undefined,
          canceledAt: s.canceledAt ?? undefined,
          metadata: (s.metadata ?? {}) as Record<string, any>,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          plan: p
            ? {
                id: p.id,
                name: p.name,
                description: p.description ?? undefined,
                amount: Number(p.amount),
                currency: p.currency,
                interval: p.interval,
                intervalCount: p.intervalCount,
                trialPeriodDays: p.trialPeriodDays ?? undefined,
                features: (p.features ?? {}) as Record<string, any>,
              }
            : undefined,
        };
      }),
    );
  } catch (error) {
    console.error("List subscriptions error:", error);
    return NextResponse.json(
      { error: "Failed to list subscriptions" },
      { status: 500 },
    );
  }
}
