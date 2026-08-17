import { env } from "@/lib/env";
import { BILLING_FEATURES, getBillingPlan } from "@circulo-ai/types";
import {
  type CustomerFeature,
  type CustomerProduct,
  Autumn,
  ProductStatus,
} from "autumn-js";

export type SubscriptionInfo = {
  plan: string | null;
  status: ProductStatus | null;
  products: CustomerProduct[];
  features: Record<string, CustomerFeature>;
};

function getAutumnClient(): Autumn | null {
  if (!env.AUTUMN_SECRET_KEY) return null;
  return new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
}

function createLocalDevSubscription(planId: string): SubscriptionInfo | null {
  const plan = getBillingPlan(planId);
  if (!plan) return null;

  const featureValues = {
    max_agents: plan.features.maxAgents,
    api_calls: plan.features.apiCalls,
    max_messages_per_day: plan.features.maxMessagesPerDay,
    kb_slots: plan.features.kbSlots,
    max_chats: plan.features.maxChats,
    team_members: plan.features.teamMembers,
    max_agents_in_chat: plan.features.maxAgentsInChat,
    rate_limit_per_minute: plan.features.rateLimitPerMinute,
  } as const;

  const features: Record<string, CustomerFeature> = {};
  for (const [id, value] of Object.entries(featureValues)) {
    features[id] = {
      id,
      name: id,
      type:
        id === "api_calls" || id === "max_messages_per_day"
          ? "single_use"
          : "continuous_use",
      ...(value === "unlimited"
        ? { unlimited: true }
        : { included_usage: value, usage: 0 }),
    };
  }

  if (plan.features.createTeamOrg) {
    features[BILLING_FEATURES.createTeamOrg.id] = {
      id: BILLING_FEATURES.createTeamOrg.id,
      name: BILLING_FEATURES.createTeamOrg.name,
      type: "static",
      included_usage: 1,
      usage: 0,
    };
  }
  if (plan.features.prioritySupport) {
    features[BILLING_FEATURES.prioritySupport.id] = {
      id: BILLING_FEATURES.prioritySupport.id,
      name: BILLING_FEATURES.prioritySupport.name,
      type: "static",
      included_usage: 1,
      usage: 0,
    };
  }

  return {
    plan: plan.id,
    status: ProductStatus.Active,
    products: [],
    features,
  };
}

/**
 * Get subscription information for an organization
 * Since we're using customerScope: "organization" in our Autumn config,
 * the customer_id should be the organization ID
 */
export async function getSubscriptionForOrg(
  organizationId: string,
): Promise<SubscriptionInfo | null> {
  if (env.NODE_ENV !== "production" && env.BILLING_LOCAL_DEV_PLAN) {
    return createLocalDevSubscription(env.BILLING_LOCAL_DEV_PLAN);
  }

  const autumn = getAutumnClient();
  if (!autumn) return null;

  try {
    const getCustomer = await autumn.customers.get(organizationId);
    const customer = getCustomer.data;

    if (!customer) {
      return null;
    }

    // Extract the active product (plan)
    const activeProduct = customer.products?.find((p) => p.status === "active");

    return {
      plan: activeProduct?.id ?? null, // e.g., "free", "pro", "team"
      status: activeProduct?.status ?? null,
      products: customer.products ?? [],
      features: customer.features ?? {},
    };
  } catch (error) {
    console.error("Failed to get subscription for org:", organizationId, error);
    return null;
  }
}

/**
 * Check if an organization has a specific plan or higher
 */
export async function orgHasPlan(
  organizationId: string,
  requiredPlans: string[],
): Promise<boolean> {
  const subscription = await getSubscriptionForOrg(organizationId);
  if (!subscription || !subscription.plan) return false;
  return requiredPlans.includes(subscription.plan);
}

/**
 * Check if organization can create team organizations
 * (requires pro plan or higher on their personal org)
 */
export async function canCreateTeamOrg(
  personalOrgId: string,
): Promise<boolean> {
  return orgHasPlan(personalOrgId, ["pro", "team", "enterprise"]);
}
