export type BillingLimit = number | "unlimited";

export type BillingPlan = {
  id: "free" | "pro" | "team" | "enterprise";
  name: string;
  description: string;
  monthlyPrice: number | null;
  recommended?: boolean;
  features: {
    maxAgents: BillingLimit;
    apiCalls: BillingLimit;
    maxMessagesPerDay: BillingLimit;
    kbSlots: BillingLimit;
    maxChats: BillingLimit;
    teamMembers: BillingLimit;
    maxAgentsInChat: BillingLimit;
    rateLimitPerMinute: BillingLimit;
    createTeamOrg: boolean;
    prioritySupport: boolean;
  };
};

export const BILLING_FEATURES = {
  createTeamOrg: {
    id: "create_team_org",
    name: "Create Team Organization",
    type: "boolean",
  },
  maxAgents: { id: "max_agents", name: "Max Agents", type: "continuous_use" },
  apiCalls: { id: "api_calls", name: "API Calls", type: "single_use" },
  prioritySupport: {
    id: "priority_support",
    name: "Priority Support",
    type: "boolean",
  },
  maxMessagesPerDay: {
    id: "max_messages_per_day",
    name: "Max Messages Per Day",
    type: "single_use",
  },
  kbSlots: {
    id: "kb_slots",
    name: "Knowledge Base Slots",
    type: "continuous_use",
  },
  maxChats: { id: "max_chats", name: "Max Chats", type: "continuous_use" },
  teamMembers: {
    id: "team_members",
    name: "Team Members",
    type: "continuous_use",
  },
  maxAgentsInChat: {
    id: "max_agents_in_chat",
    name: "Max Agents In Chat",
    type: "continuous_use",
  },
  rateLimitPerMinute: {
    id: "rate_limit_per_minute",
    name: "Rate Limit Per Minute",
    type: "continuous_use",
  },
} as const;

export const BILLING_PLANS: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Explore Circulo with the essentials for personal work.",
    monthlyPrice: 0,
    features: {
      maxAgents: 3,
      apiCalls: 1000,
      maxMessagesPerDay: 100,
      kbSlots: 1,
      maxChats: 25,
      teamMembers: 1,
      maxAgentsInChat: 3,
      rateLimitPerMinute: 10,
      createTeamOrg: false,
      prioritySupport: false,
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "More capacity and collaboration for independent builders.",
    monthlyPrice: 20,
    features: {
      maxAgents: 10,
      apiCalls: 10000,
      maxMessagesPerDay: 1000,
      kbSlots: 10,
      maxChats: 250,
      teamMembers: 5,
      maxAgentsInChat: 5,
      rateLimitPerMinute: 25,
      createTeamOrg: true,
      prioritySupport: false,
    },
  },
  {
    id: "team",
    name: "Team",
    description: "Shared workspaces and higher limits for growing teams.",
    monthlyPrice: 60,
    recommended: true,
    features: {
      maxAgents: 50,
      apiCalls: 50000,
      maxMessagesPerDay: 5000,
      kbSlots: 50,
      maxChats: 1000,
      teamMembers: 25,
      maxAgentsInChat: 10,
      rateLimitPerMinute: 75,
      createTeamOrg: true,
      prioritySupport: true,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Unlimited capacity, governance, and dedicated support.",
    monthlyPrice: null,
    features: {
      maxAgents: "unlimited",
      apiCalls: "unlimited",
      maxMessagesPerDay: "unlimited",
      kbSlots: "unlimited",
      maxChats: "unlimited",
      teamMembers: "unlimited",
      maxAgentsInChat: "unlimited",
      rateLimitPerMinute: "unlimited",
      createTeamOrg: true,
      prioritySupport: true,
    },
  },
] as const;

export function getBillingPlan(
  planId: string | null | undefined,
): BillingPlan | undefined {
  return BILLING_PLANS.find((plan) => plan.id === planId);
}

export function formatBillingLimit(value: BillingLimit): string {
  return value === "unlimited" ? "Unlimited" : value.toLocaleString();
}
