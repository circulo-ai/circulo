import { isCloudRuntime } from "@/lib/deployment/instance-auth";
import { env, isTruthy } from "@/lib/env";
import { BILLING_FEATURES, getBillingPlan } from "@circulo-ai/types";

import { Autumn } from "autumn-js";

/**
 * Compatibility shape used by the application billing layer.
 *
 * Autumn 1.x exposes balances and flags rather than the legacy
 * `CustomerFeature`/`CustomerProduct` response shape. Keeping this small
 * application-owned shape prevents the provider SDK from leaking into the
 * rest of the authorization and limits code.
 */
export type BillingFeature = {
  id: string;
  name: string;
  type: string;
  included_usage?: number;
  usage?: number;
  unlimited?: boolean;
};

export type BillingProduct = {
  id: string;
  status: string;
};

type ProductStatus = BillingProduct["status"];

export type SubscriptionInfo = {
  plan: string | null;
  status: ProductStatus | null;
  products: BillingProduct[];
  features: Record<string, BillingFeature>;
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

  const features: Record<string, BillingFeature> = {};
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
    status: "active",
    products: [],
    features,
  };
}

function createSelfHostedSubscription(): SubscriptionInfo {
  const featureIds = [
    "max_agents",
    "api_calls",
    "max_messages_per_day",
    "kb_slots",
    "max_chats",
    "team_members",
    "max_agents_in_chat",
    "rate_limit_per_minute",
    "create_team_org",
    "priority_support",
  ];
  return {
    plan: "self-hosted",
    status: "local",
    products: [],
    features: Object.fromEntries(
      featureIds.map((id) => [
        id,
        {
          id,
          name: id,
          type: "continuous_use",
          unlimited: true,
          included_usage: undefined,
          usage: 0,
        },
      ]),
    ),
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
  // Billing is a cloud adapter. Local desktop and self-hosted runtimes get
  // unlimited product entitlements even when shared environment variables
  // happen to contain billing configuration.
  if (!isCloudRuntime() || !isTruthy(env.BILLING_ENABLED)) {
    return createSelfHostedSubscription();
  }

  if (env.NODE_ENV !== "production" && env.BILLING_LOCAL_DEV_PLAN) {
    return createLocalDevSubscription(env.BILLING_LOCAL_DEV_PLAN);
  }

  const autumn = getAutumnClient();
  if (!autumn) return null;

  try {
    const customer = await autumn.customers.get({
      customerId: organizationId,
    });

    const products: BillingProduct[] = customer.subscriptions.map(
      (subscription) => ({
        id: subscription.planId,
        status: subscription.status,
      }),
    );

    const features: Record<string, BillingFeature> = {};
    for (const [id, balance] of Object.entries(customer.balances)) {
      features[id] = {
        id,
        name: balance.feature?.name ?? id,
        type: balance.feature?.type ?? "metered",
        included_usage: balance.granted,
        usage: balance.usage,
        unlimited: balance.unlimited,
      };
    }

    for (const [id, flag] of Object.entries(customer.flags)) {
      if (features[id]) continue;
      features[id] = {
        id,
        name: flag.feature?.name ?? id,
        type: flag.feature?.type ?? "boolean",
        included_usage: 1,
        usage: 0,
        unlimited: false,
      };
    }

    // Extract the active subscription (plan)
    const activeProduct = products.find(
      (product) => product.status === "active",
    );

    return {
      plan: activeProduct?.id ?? null, // e.g., "free", "pro", "team"
      status: activeProduct?.status ?? null,
      products,
      features,
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
  if (subscription.plan === "self-hosted") return true;
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
