import { BILLING_PLANS } from "@circulo-ai/types";
import { feature, featureItem, priceItem, product } from "atmn";

// Boolean feature - access is granted by including it with included_usage: 1
export const createTeamOrganization = feature({
  id: "create_team_org",
  name: "Create Team Organization",
  type: "boolean",
});

// Continuous use - tracks ongoing count (like active agents/seats)
export const maxAgents = feature({
  id: "max_agents",
  name: "Max Agents",
  type: "continuous_use",
});

// Single use - consumable that resets each billing period
export const apiCalls = feature({
  id: "api_calls",
  name: "API Calls",
  type: "single_use",
});

export const prioritySupport = feature({
  id: "priority_support",
  name: "Priority Support",
  type: "boolean",
});

export const maxMessagesPerDay = feature({
  id: "max_messages_per_day",
  name: "Max Messages Per Day",
  type: "single_use",
});

export const kbSlots = feature({
  id: "kb_slots",
  name: "Knowledge Base Slots",
  type: "continuous_use",
});

export const maxChats = feature({
  id: "max_chats",
  name: "Max Chats",
  type: "continuous_use",
});

export const teamMembers = feature({
  id: "team_members",
  name: "Team Members",
  type: "continuous_use",
});

export const maxAgentsInChat = feature({
  id: "max_agents_in_chat",
  name: "Max Agents In Chat",
  type: "continuous_use",
});

export const rateLimitPerMinute = feature({
  id: "rate_limit_per_minute",
  name: "Rate Limit Per Minute",
  type: "continuous_use",
});

const usage = (value: number | "unlimited") =>
  value === "unlimited" ? "inf" : value;

const itemsFor = (plan: (typeof BILLING_PLANS)[number]) => [
  featureItem({
    feature_id: maxAgents.id,
    included_usage: usage(plan.features.maxAgents),
  }),
  featureItem({
    feature_id: apiCalls.id,
    included_usage: usage(plan.features.apiCalls),
    interval: "month",
  }),
  featureItem({
    feature_id: maxMessagesPerDay.id,
    included_usage: usage(plan.features.maxMessagesPerDay),
    interval: "day",
  }),
  featureItem({
    feature_id: kbSlots.id,
    included_usage: usage(plan.features.kbSlots),
  }),
  featureItem({
    feature_id: maxChats.id,
    included_usage: usage(plan.features.maxChats),
  }),
  featureItem({
    feature_id: teamMembers.id,
    included_usage: usage(plan.features.teamMembers),
  }),
  featureItem({
    feature_id: maxAgentsInChat.id,
    included_usage: usage(plan.features.maxAgentsInChat),
  }),
  featureItem({
    feature_id: rateLimitPerMinute.id,
    included_usage: usage(plan.features.rateLimitPerMinute),
  }),
  ...(plan.features.createTeamOrg
    ? [
        featureItem({
          feature_id: createTeamOrganization.id,
          included_usage: 1,
        }),
      ]
    : []),
  ...(plan.features.prioritySupport
    ? [featureItem({ feature_id: prioritySupport.id, included_usage: 1 })]
    : []),
];

export const free = product({
  id: BILLING_PLANS[0].id,
  name: BILLING_PLANS[0].name,
  is_default: true, // New users get this plan
  items: itemsFor(BILLING_PLANS[0]),
});

export const pro = product({
  id: BILLING_PLANS[1].id,
  name: BILLING_PLANS[1].name,
  items: [
    ...itemsFor(BILLING_PLANS[1]),
    priceItem({ price: 20, interval: "month" }),
  ],
});

export const team = product({
  id: BILLING_PLANS[2].id,
  name: BILLING_PLANS[2].name,
  items: [
    ...itemsFor(BILLING_PLANS[2]),
    priceItem({ price: 60, interval: "month" }),
  ],
});

export const enterprise = product({
  id: BILLING_PLANS[3].id,
  name: BILLING_PLANS[3].name,
  items: itemsFor(BILLING_PLANS[3]),
});

export default {
  features: [
    createTeamOrganization,
    maxAgents,
    apiCalls,
    prioritySupport,
    maxMessagesPerDay,
    kbSlots,
    maxChats,
    teamMembers,
    maxAgentsInChat,
    rateLimitPerMinute,
  ],
  products: [free, pro, team, enterprise],
};
