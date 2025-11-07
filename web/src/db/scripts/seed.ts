import { db } from "..";
import { subscriptionPlans, type PlanFeatures } from "../schema/billing";

type PlanSeed = typeof subscriptionPlans.$inferInsert;

const plans: PlanSeed[] = [
  {
    name: "Explorer",
    slug: "free",
    description: "Get started exploring Circulo's agent universe.",
    usdPrice: "0.00",
    billingIntervalDays: 30,
    isActive: true,
    features: {
      rateLimitPerMinute: 30,
      maxAgents: 5,
      maxChats: 10,
      kbSlots: 1,
      roundtableAgents: 2,
      marketplaceAccess: "browse",
      revenueSharePercent: null,
    } satisfies PlanFeatures,
  },
  {
    name: "Creator",
    slug: "creator",
    description: "Build and sell your AI agents and knowledge bases.",
    usdPrice: "19.00",
    billingIntervalDays: 30,
    isActive: true,
    features: {
      rateLimitPerMinute: 100,
      maxAgents: 10,
      maxChats: 1000,
      kbSlots: 5,
      roundtableAgents: 5,
      marketplaceAccess: "full",
      revenueSharePercent: 15,
    } satisfies PlanFeatures,
  },
  {
    name: "Professional",
    slug: "pro",
    description: "Scale your AI operations with advanced features and team collaboration.",
    usdPrice: "49.00",
    billingIntervalDays: 30,
    isActive: true,
    features: {
      rateLimitPerMinute: 300,
      maxAgents: 50,
      maxChats: 2000,
      kbSlots: 15,
      roundtableAgents: 10,
      marketplaceAccess: "full",
      teamMembers: 3,
      revenueSharePercent: 10,
    } satisfies PlanFeatures,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "Custom solutions for large-scale AI deployments and partnerships.",
    usdPrice: "0.00", // Custom pricing - contact sales
    billingIntervalDays: 30,
    isActive: true,
    features: {
      rateLimitPerMinute: 10000,
      maxAgents: null, // unlimited
      maxChats: null,  // unlimited
      kbSlots: null,   // unlimited
      roundtableAgents: null, // unlimited
      marketplaceAccess: "full",
      teamMembers: null, // unlimited
      dedicatedSupport: true,
      customBilling: true,
      revenueSharePercent: 0, // Custom negotiation
    } satisfies PlanFeatures,
  },
];

async function seed() {
  try {
    console.log("🌱 Seeding subscription plans...");

    // Use onConflictDoUpdate for idempotent seeding
    for (const plan of plans) {
      await db
        .insert(subscriptionPlans)
        .values(plan)
        .onConflictDoUpdate({
          target: subscriptionPlans.slug,
          set: {
            name: plan.name,
            description: plan.description,
            usdPrice: plan.usdPrice,
            billingIntervalDays: plan.billingIntervalDays,
            features: plan.features,
            isActive: plan.isActive,
          },
        });
    }

    console.log("✓ Subscription plans seeded successfully");
    console.log(`  - ${plans.length} plans created/updated`);

    // Display summary
    console.log("\n📊 Plan Summary:");
    plans.forEach((plan) => {
      const features = plan.features as PlanFeatures;
      console.log(`  ${plan.name} ($${plan.usdPrice}/mo):`);
      console.log(`    - Agents: ${features.maxAgents ?? "∞"}`);
      console.log(`    - Chats: ${features.maxChats ?? "∞"}`);
      console.log(`    - Rate Limit: ${features.rateLimitPerMinute}/min`);
      console.log(`    - Revenue Share: ${features.revenueSharePercent ?? "N/A"}%`);
    });

  } catch (error) {
    console.error("✗ Error seeding subscription plans:", error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seed as seedSubscriptionPlans };
