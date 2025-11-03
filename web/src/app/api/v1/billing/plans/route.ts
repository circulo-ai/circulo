import { db } from "@/db";
import { subscriptionPlan } from "@/db/schema";
import {
  ApiResponseBuilder,
  createRoute,
  loggerMiddleware,
  rateLimitMiddleware,
} from "@/lib/server";
import { eq } from "drizzle-orm";

export const GET = createRoute({
  middleware: [
    loggerMiddleware,
    rateLimitMiddleware({
      maxRequests: 100,
      windowMs: 60000,
      keyPrefix: "subscription-plans",
    }),
  ],
  handler: async (req, context) => {
    const plans = await db.query.subscriptionPlan.findMany({
      where: eq(subscriptionPlan.active, true),
      orderBy: (p, { asc }) => [asc(p.amount)],
    });

    const formattedPlans = plans.map((p) => ({
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
    }));

    return ApiResponseBuilder.success(formattedPlans, {
      count: formattedPlans.length,
    });
  },
});
