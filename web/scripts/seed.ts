import 'dotenv/config';
import { db } from "@/db";
import {
  plans,
  planFeatures,
  planLimits,
  usageMetrics,
} from "@/db/schema/billing";
import { eq } from "drizzle-orm";

type PlanSeed = {
  plan: {
    name: string;
    slug: string;
    description?: string | null;
    pricingModel?: "flat" | "tiered" | "usage" | "hybrid";
    basePrice?: string | null; // decimal as string
    currency?: string;
    billingInterval?: "day" | "week" | "month" | "year";
    intervalCount?: number;
    trialDays?: number;
    isActive?: boolean;
    isPublic?: boolean;
    providerPlanId?: string | null; // Stripe price id if applicable
    providerProductId?: string | null;
    metadata?: Record<string, any> | null;
  };
  features?: Array<{
    featureKey: string;
    featureName: string;
    featureType: "boolean" | "limit" | "multiplier";
    booleanValue?: boolean;
    numericValue?: string | null; // decimal as string
    textValue?: string | null;
    description?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  limits?: Array<{
    limitKey: string;
    limitName: string;
    maxValue?: number | null; // null means unlimited
    period?: "hour" | "day" | "month" | "billing_cycle";
    softLimit?: number | null;
    softLimitWarning?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  usage?: Array<{
    metricKey: string;
    metricName: string;
    unit: string;
    pricingType: "per_unit" | "tiered" | "package";
    unitPrice?: string | null; // decimal as string
    packageSize?: number | null;
    tiers?: Array<{ upTo: number; price: number }> | null;
    resetInterval?: string | null; // 'monthly', 'billing_cycle', 'never'
    providerMetricId?: string | null;
    metadata?: Record<string, any> | null;
  }>;
};

const seeds: PlanSeed[] = [
  {
    plan: {
      name: "Free",
      slug: "free",
      description: "Starter plan with limited usage",
      pricingModel: "flat",
      basePrice: "0",
      currency: "USD",
      billingInterval: "month",
      intervalCount: 1,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      metadata: { tier: 0 },
    },
    features: [
      {
        featureKey: "basic_access",
        featureName: "Basic Access",
        featureType: "boolean",
        booleanValue: true,
        description: "Access to basic features",
      },
    ],
    limits: [
      {
        limitKey: "messages",
        limitName: "Messages per month",
        maxValue: 1000,
        period: "month",
        softLimit: 900,
        softLimitWarning: "Approaching free tier limit",
      },
    ],
    usage: [
      {
        metricKey: "messages",
        metricName: "Messages",
        unit: "count",
        pricingType: "per_unit",
        unitPrice: "0",
        resetInterval: "monthly",
      },
    ],
  },
  {
    plan: {
      name: "Pro",
      slug: "pro",
      description: "Professional plan with higher limits",
      pricingModel: "flat",
      basePrice: "20.00",
      currency: "USD",
      billingInterval: "month",
      intervalCount: 1,
      trialDays: 7,
      isActive: true,
      isPublic: true,
      providerPlanId: process.env.STRIPE_PRICE_PRO || null,
      metadata: { tier: 1 },
    },
    features: [
      {
        featureKey: "priority_support",
        featureName: "Priority Support",
        featureType: "boolean",
        booleanValue: true,
        description: "Access to priority support channels",
      },
      {
        featureKey: "model_multiplier",
        featureName: "Model Multiplier",
        featureType: "multiplier",
        numericValue: "1.5",
        description: "Higher limits multiplier for advanced models",
      },
    ],
    limits: [
      {
        limitKey: "messages",
        limitName: "Messages per month",
        maxValue: 100000,
        period: "month",
      },
    ],
    usage: [
      {
        metricKey: "messages",
        metricName: "Messages",
        unit: "count",
        pricingType: "per_unit",
        unitPrice: "0.0025",
        resetInterval: "monthly",
        providerMetricId: process.env.STRIPE_METER_MESSAGES || null,
      },
    ],
  },
];

async function upsertPlan(seed: PlanSeed) {
  const { plan, features = [], limits = [], usage = [] } = seed;
  const existing = await db.query.plans.findFirst({ where: eq(plans.slug, plan.slug) });

  let planRow = existing;
  if (!existing) {
    const [inserted] = await db.insert(plans).values({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? null,
      pricingModel: plan.pricingModel ?? "flat",
      basePrice: plan.basePrice ?? null,
      currency: plan.currency ?? "USD",
      billingInterval: plan.billingInterval ?? "month",
      intervalCount: plan.intervalCount ?? 1,
      trialDays: plan.trialDays ?? 0,
      isActive: plan.isActive ?? true,
      isPublic: plan.isPublic ?? true,
      providerPlanId: plan.providerPlanId ?? null,
      providerProductId: plan.providerProductId ?? null,
      metadata: plan.metadata ?? null,
    }).returning();
    planRow = inserted;
    console.log(`[seed] inserted plan ${plan.slug} (${planRow.id})`);
  } else {
    await db
      .update(plans)
      .set({
        description: plan.description ?? existing.description ?? null,
        providerPlanId: plan.providerPlanId ?? existing.providerPlanId ?? null,
        providerProductId: plan.providerProductId ?? existing.providerProductId ?? null,
        metadata: plan.metadata ?? existing.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, existing.id));
    console.log(`[seed] plan ${plan.slug} already exists (${existing.id}), updated metadata/providers`);
  }

  if (!planRow) throw new Error(`Failed to upsert plan ${plan.slug}`);

  for (const f of features) {
    const exists = await db.query.planFeatures.findFirst({
      where: eq(planFeatures.featureKey, f.featureKey),
    });
    if (exists) {
      await db
        .update(planFeatures)
        .set({
          featureName: f.featureName,
          featureType: f.featureType,
          booleanValue: f.booleanValue ?? exists.booleanValue ?? null,
          numericValue: f.numericValue ?? exists.numericValue ?? null,
          textValue: f.textValue ?? exists.textValue ?? null,
          description: f.description ?? exists.description ?? null,
          metadata: f.metadata ?? exists.metadata ?? null,
          updatedAt: new Date(),
        })
        .where(eq(planFeatures.id, exists.id));
    } else {
      await db.insert(planFeatures).values({
        planId: planRow.id,
        featureKey: f.featureKey,
        featureName: f.featureName,
        featureType: f.featureType,
        booleanValue: f.booleanValue ?? null,
        numericValue: f.numericValue ?? null,
        textValue: f.textValue ?? null,
        description: f.description ?? null,
        metadata: f.metadata ?? null,
      });
    }
  }

  for (const l of limits) {
    const exists = await db.query.planLimits.findFirst({
      where: eq(planLimits.limitKey, l.limitKey),
    });
    if (exists) {
      await db
        .update(planLimits)
        .set({
          limitName: l.limitName,
          maxValue: l.maxValue ?? exists.maxValue ?? null,
          period: l.period ?? exists.period ?? "month",
          softLimit: l.softLimit ?? exists.softLimit ?? null,
          softLimitWarning: l.softLimitWarning ?? exists.softLimitWarning ?? null,
          metadata: l.metadata ?? exists.metadata ?? null,
          updatedAt: new Date(),
        })
        .where(eq(planLimits.id, exists.id));
    } else {
      await db.insert(planLimits).values({
        planId: planRow.id,
        limitKey: l.limitKey,
        limitName: l.limitName,
        maxValue: l.maxValue ?? null,
        period: l.period ?? "month",
        softLimit: l.softLimit ?? null,
        softLimitWarning: l.softLimitWarning ?? null,
        metadata: l.metadata ?? null,
      });
    }
  }

  for (const m of usage) {
    const exists = await db.query.usageMetrics.findFirst({
      where: eq(usageMetrics.metricKey, m.metricKey),
    });
    if (exists) {
      await db
        .update(usageMetrics)
        .set({
          metricName: m.metricName,
          unit: m.unit,
          pricingType: m.pricingType,
          unitPrice: m.unitPrice ?? exists.unitPrice ?? null,
          packageSize: m.packageSize ?? exists.packageSize ?? null,
          tiers: m.tiers ?? exists.tiers ?? null,
          resetInterval: m.resetInterval ?? exists.resetInterval ?? null,
          providerMetricId: m.providerMetricId ?? exists.providerMetricId ?? null,
          metadata: m.metadata ?? exists.metadata ?? null,
          updatedAt: new Date(),
        })
        .where(eq(usageMetrics.id, exists.id));
    } else {
      await db.insert(usageMetrics).values({
        planId: planRow.id,
        metricKey: m.metricKey,
        metricName: m.metricName,
        unit: m.unit,
        pricingType: m.pricingType,
        unitPrice: m.unitPrice ?? null,
        packageSize: m.packageSize ?? null,
        tiers: m.tiers ?? null,
        resetInterval: m.resetInterval ?? null,
        providerMetricId: m.providerMetricId ?? null,
        metadata: m.metadata ?? null,
      });
    }
  }
}

async function main() {
  console.log("[seed] starting plan seed");
  for (const seed of seeds) {
    await upsertPlan(seed);
  }
  console.log("[seed] completed");
}

main().catch((err) => {
  console.error("[seed] error", err);
  process.exit(1);
});
