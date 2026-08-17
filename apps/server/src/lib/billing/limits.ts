import { getSubscriptionForOrg } from "@/lib/billing/autumn";
import {
  ForbiddenError,
  getBillingPlan,
  type BillingLimit,
} from "@circulo-ai/types";

export type OrganizationLimitFeature =
  | "max_agents"
  | "max_chats"
  | "max_agents_in_chat"
  | "kb_slots"
  | "team_members"
  | "max_messages_per_day"
  | "api_calls";

type BillingPlanFeature = keyof NonNullable<
  ReturnType<typeof getBillingPlan>
>["features"];

const planFeatureById: Record<OrganizationLimitFeature, BillingPlanFeature> = {
  max_agents: "maxAgents",
  max_chats: "maxChats",
  max_agents_in_chat: "maxAgentsInChat",
  kb_slots: "kbSlots",
  team_members: "teamMembers",
  max_messages_per_day: "maxMessagesPerDay",
  api_calls: "apiCalls",
};

export async function getOrganizationFeatureLimit(
  organizationId: string,
  feature: OrganizationLimitFeature,
): Promise<BillingLimit> {
  const subscription = await getSubscriptionForOrg(organizationId);
  const configured = subscription?.features[feature];
  if (configured?.unlimited) return "unlimited";
  if (typeof configured?.included_usage === "number") {
    return configured.included_usage;
  }

  const plan = getBillingPlan(subscription?.plan ?? "free");
  return (
    (plan?.features[planFeatureById[feature]] as BillingLimit | undefined) ??
    "unlimited"
  );
}

export async function enforceOrganizationFeatureLimit(params: {
  organizationId: string;
  feature: OrganizationLimitFeature;
  current: number;
  resourceName: string;
}): Promise<void> {
  const limit = await getOrganizationFeatureLimit(
    params.organizationId,
    params.feature,
  );
  if (limit !== "unlimited" && params.current >= limit) {
    throw new ForbiddenError(
      `${params.resourceName} limit reached for the current plan. Upgrade the workspace to continue.`,
    );
  }
}
