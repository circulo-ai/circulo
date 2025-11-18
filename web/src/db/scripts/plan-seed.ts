import "dotenv/config";

import { subscriptionPlans, type PlanFeatures } from "@/db";
import { sql } from "drizzle-orm";
import { db } from "..";

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
      maxMessagesPerDay: 20,
      rateLimitPerMinute: 30,
      maxAgents: 5,
      maxChats: 10,
      kbSlots: 1,
      maxAgentsInChat: 4,
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
      maxMessagesPerDay: 1000,
      rateLimitPerMinute: 100,
      maxAgents: 10,
      maxChats: 1000,
      kbSlots: 5,
      maxAgentsInChat: 7,
    } satisfies PlanFeatures,
  },
  {
    name: "Professional",
    slug: "pro",
    description:
      "Scale your AI operations with advanced features and team collaboration.",
    usdPrice: "49.00",
    billingIntervalDays: 30,
    isActive: true,
    features: {
      maxMessagesPerDay: 2000,
      rateLimitPerMinute: 300,
      maxAgents: 50,
      maxChats: 2000,
      kbSlots: 15,
      teamMembers: 3,
      maxAgentsInChat: 10,
    } satisfies PlanFeatures,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description:
      "Custom solutions for large-scale AI deployments and partnerships.",
    usdPrice: "0.00", // Custom pricing - contact sales
    billingIntervalDays: 30,
    isActive: true,
    features: {
      maxMessagesPerDay: 5000,
      rateLimitPerMinute: 10000,
      maxAgents: null, // unlimited
      maxChats: null, // unlimited
      kbSlots: null, // unlimited
      teamMembers: null, // unlimited
      dedicatedSupport: true,
      customBilling: true,
      maxAgentsInChat: 20,
    } satisfies PlanFeatures,
  },
];

async function planSeed() {
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
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            usdPrice: sql`excluded.usd_price`,
            billingIntervalDays: sql`excluded.billing_interval_days`,
            features: sql`excluded.features`,
            isActive: sql`excluded.is_active`,
            // Note: createdAt is intentionally not updated
          },
        });
    }

    console.log("✓ Subscription plans seeded successfully");
    console.log(`  - ${plans.length} plans created/updated`);

    // Verify and display summary
    const insertedPlans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.id);

    console.log("\n📊 Plan Summary:");
    insertedPlans.forEach((plan) => {
      const features = plan.features as PlanFeatures;
      console.log(`  ${plan.name} ($${plan.usdPrice}/mo):`);
      console.log(`    - Agents: ${features.maxAgents ?? "∞"}`);
      console.log(`    - Chats: ${features.maxChats ?? "∞"}`);
      console.log(`    - KB Slots: ${features.kbSlots ?? "∞"}`);
      console.log(`    - Rate Limit: ${features.rateLimitPerMinute}/min`);
    });
  } catch (error) {
    console.error("✗ Error seeding subscription plans:", error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  planSeed()
    .then(() => {
      console.log("\n✓ Seed completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n✗ Seed failed:", error);
      process.exit(1);
    });
}

export { planSeed };
