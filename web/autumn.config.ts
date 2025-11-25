import { feature, featureItem, product } from "atmn";

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

export const free = product({
  id: "free",
  name: "Free",
  is_default: true, // New users get this plan
  items: [
    featureItem({
      feature_id: maxAgents.id,
      included_usage: 3,
    }),
    featureItem({
      feature_id: apiCalls.id,
      included_usage: 1000,
      interval: "month",
    }),
    // No create_team_org = Free users can't create team orgs
    // No priority_support = Free users don't have priority support
  ],
});

export const pro = product({
  id: "pro",
  name: "Pro",
  items: [
    featureItem({
      feature_id: maxAgents.id,
      included_usage: 10,
    }),
    featureItem({
      feature_id: apiCalls.id,
      included_usage: 10000,
      interval: "month",
    }),
    // For boolean features, include with included_usage: 1 to grant access
    featureItem({
      feature_id: createTeamOrganization.id,
      included_usage: 1,
    }),
  ],
});

export const team = product({
  id: "team",
  name: "Team",
  items: [
    featureItem({
      feature_id: maxAgents.id,
      included_usage: 50,
    }),
    featureItem({
      feature_id: apiCalls.id,
      included_usage: 50000,
      interval: "month",
    }),
    featureItem({
      feature_id: createTeamOrganization.id,
      included_usage: 1,
    }),
    featureItem({
      feature_id: prioritySupport.id,
      included_usage: 1,
    }),
  ],
});

export const enterprise = product({
  id: "enterprise",
  name: "Enterprise",
  items: [
    featureItem({
      feature_id: maxAgents.id,
      included_usage: "inf", // Unlimited
    }),
    featureItem({
      feature_id: apiCalls.id,
      included_usage: "inf",
      interval: "month",
    }),
    featureItem({
      feature_id: createTeamOrganization.id,
      included_usage: 1,
    }),
    featureItem({
      feature_id: prioritySupport.id,
      included_usage: 1,
    }),
  ],
});
